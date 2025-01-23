import axios from "axios";
import OpenAI from "openai";
import { JSDOM } from "jsdom";
import { db } from "../lib/db";
import axiosRetry from "axios-retry";
import { Request, Response } from "express";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type AnalyzeRequest = {
  url: string;
  twitterAccountId: string;
};

type AnalyzeResponse = {
  title: string;
  metaDescription: string;
  keywords: string;
  headings: string[];
  summary: string;
};

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

export const AnalyzeSiteController = async (req: Request, res: Response) => {
  const { url, twitterAccountId } = req.body;

  try {
    console.log(`Fetching content from URL: ${url}`);

    // Fetch the URL content
    const { data: html } = await axios.get(url, { timeout: 20000 });

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
    const keywords =
      document
        .querySelector('meta[name="keywords"]')
        ?.getAttribute("content") || "No Keywords Found";

    const headings = Array.from(document.querySelectorAll("h1"))
      .map((el) => el.textContent?.trim() || "")
      .slice(0, 5);

    const bodyText = document.body.textContent?.slice(0, 2000) || "";

    let summary = "AI analysis not enabled.";

    if (process.env.OPENAI_API_KEY) {
      console.log(`Calling OpenAI API with model: gpt-4o-mini`);
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You are an AI that summarizes websites based on their content.",
          },
          {
            role: "user",
            content: `Analyze this website content and provide a detailed description of its purpose, services, and the problems it solves. Additionally, suggest relevant search keywords that can be used to query the Twitter API:
            Title: ${title}
            Meta Description: ${metaDescription}
            Keywords: ${keywords}
            Headings: ${headings.join(", ")}
            Body Text: ${bodyText}`,
          },
        ],
      });
      summary =
        aiResponse.choices[0].message?.content ||
        "Unable to generate a summary.";
    }

    // Return response
    const response: AnalyzeResponse = {
      title,
      metaDescription,
      keywords,
      headings,
      summary,
    };

    await db.painPoint.update({
      where: { twitterAccountId },
      data: {
        siteSummary: summary,
        siteKeywords: keywords,
        metaDescription,
      },
    });
    res.status(200).json(response);
  } catch (error) {
    console.error("Error analyzing URL:", error.message);

    // Check if the error is due to the site being down or not responding
    if (error.code === "ECONNABORTED" || error.response?.status >= 500) {
      res.status(503).send({
        error: "The site is down or not responding. Please try again later.",
      });
    } else if (error.message === "The site returned no content.") {
      // Handle cases where the site returns no content
      res.status(502).send({
        error: "The site returned no content. Please try again later.",
      });
    } else {
      console.log("Error analyzing URL:", error.message);
      res.status(500).send({ error: "Failed to analyze the URL." });
    }
  }
};
