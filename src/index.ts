import "module-alias/register"
import cors from "cors"
import dotenv from "dotenv"
import express , {Application} from "express"
import { scheduleJobs } from "./scheduler"


const port = process.env.PORT || 3000
const app:Application = express()
dotenv.config()

app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());

scheduleJobs();

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})