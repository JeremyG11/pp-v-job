import axios from "axios";
import OpenAI from "openai";
import { JSDOM } from "jsdom";
import { db } from "../lib/db";
import axiosRetry from "axios-retry";
import { Request, Response } from "express";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

axiosRetry(axios, {
  retries: 3,
  retryDelay: (retryCount) => {
    console.log(`Retry attempt: ${retryCount}`);
    return retryCount * 2000;
  },
  retryCondition: (error) => {
    return error.code === "ECONNABORTED" || error.response?.status >= 500;
  },
});

interface AnalyzeRequest {
  url: string;
  twitterAccountId: string;
}

interface BusinessData {
  businessType: string;
  businessRole: string;
  coreServices: string[];
  painPoints: string[];
  brandingKeywords: string[];
  siteSummary: string;
}

interface AnalyzeResponse {
  message: string;
  data: BusinessData;
}

export const AnalyzeSiteController = async (
  req: Request<{}, {}, AnalyzeRequest>,
  res: Response<AnalyzeResponse | { error: string }>
): Promise<void> => {
  const { url, twitterAccountId } = req.body;

  try {
    const { data: html } = await axios.get<string>(url, { timeout: 20000 });

    if (!html || html.trim().length === 0) {
      throw new Error("The site returned no content.");
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract metadata
    const title =
      document.querySelector("title")?.textContent || "No Title Found";
    const metaDescription =
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content") || "No Meta Description Found";
    const headings = Array.from(document.querySelectorAll("h1"))
      .map((el) => el.textContent?.trim() || "")
      .slice(0, 5);
    const bodyText = document.body.textContent || "";

    let businessData: BusinessData = {
      businessType: "Unknown",
      businessRole: "Not specified",
      coreServices: [],
      painPoints: [],
      brandingKeywords: [],
      siteSummary: metaDescription,
    };

    // Call OpenAI to extract business identity and site summary
    if (process.env.OPENAI_API_KEY) {
      try {
        const aiResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0,
          messages: [
            {
              role: "system",
              content: `You are an AI that extracts structured business information from a website.
      Your response MUST be a valid JSON object. DO NOT include extra text or explanations.
      The field "siteSummary" should use proper Markdown formatting.`,
            },
            {
              role: "user",
              content: `Analyze the website content and return ONLY a valid JSON object:
      {
        "businessType": "String" (e.g., "App", "E-commerce", "SaaS"),
        "businessRole": "String",
        "coreServices": ["String"],
        "painPoints": ["String"],
        "brandingKeywords": ["String"],
        "searchKeywords": ["String"], // Optimized for Twitter API searches
        "siteSummary": "String" // Use Markdown formatting here
      }

      **IMPORTANT RULES**:
      - Your response MUST be **a valid JSON object only**.
      - **Use proper Markdown ONLY inside "siteSummary"** (headers, bullet points, bold text, etc.).
      - DO NOT include explanations, error messages, or any text outside JSON.

      **Example siteSummary formatting:**
      \`\`\`
      ## About the Business
      **Automate your workflows effortlessly.**

      ### Services
      - AI-powered **task automation** 🛠️
      - **Smart scheduling** for teams 🗓️
      - Seamless **collaboration tools** 🤝

      ### Pain Points Solved
       Eliminates **manual workflow delays**  
       **Streamlines** task assignments  
       Reduces **team coordination overhead**  
      \`\`\`

      Title: ${title}
      Meta Description: ${metaDescription}
      Headings: ${headings.join(", ")}
      Body Text: ${bodyText}`,
            },
          ],
        });

        const extractedData: string =
          aiResponse.choices[0]?.message?.content || "{}";

        console.log("AI response:", extractedData);
        try {
          businessData = JSON.parse(extractedData) as BusinessData;
        } catch (parseError) {
          console.log("Error parsing AI response:", parseError);
          console.log("Raw AI response:", extractedData);
        }
      } catch (aiError) {
        console.log("OpenAI API Error:", aiError);
      }
    }

    // Update database
    await db.painPoint.update({
      where: { twitterAccountId },
      data: {
        siteSummary: businessData.siteSummary,
        description: metaDescription,
        businessType: businessData.businessType,
        businessRole: businessData.businessRole,
        brandingKeywords: businessData.brandingKeywords,
      },
    });

    res.status(200).json({
      message: "Site analyzed successfully",
      data: businessData,
    });
  } catch (error: any) {
    console.error("Error analyzing URL:", error.message);

    if (error.code === "ECONNABORTED" || error.response?.status >= 500) {
      res.status(503).json({
        error: "The site is down or not responding. Please try again later.",
      });
    } else if (error.message === "The site returned no content.") {
      res.status(502).json({
        error: "The site returned no content. Please try again later.",
      });
    } else if (error.message.includes("Unexpected token")) {
      res.status(500).json({
        error: "AI response was invalid JSON. Please try again later.",
      });
    } else {
      res.status(500).json({ error: "Failed to analyze the URL." });
    }
  }
};
