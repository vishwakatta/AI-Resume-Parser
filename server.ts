import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing from environment");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Multer for file uploads (resumes)
  const upload = multer({ storage: multer.memoryStorage() });

  // API: Send Email
  app.post("/api/send-invite", async (req, res) => {
    const { email, candidateName, decision, date, time, meetingLink } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const isSelected = decision === "Selected";
    const subject = isSelected 
      ? `Interview Invitation: AI Recruitment Agent` 
      : `Application Update: AI Recruitment Agent`;

    const text = isSelected
      ? `Hi ${candidateName},\n\nYou have been selected for an interview.\nDate: ${date}\nTime: ${time}\nMeeting Link: ${meetingLink}\n\nBest regards,\nAI Recruitment Team`
      : `Hi ${candidateName},\n\nThank you for your interest. After reviewing your profile, we have decided not to move forward with your application at this time.\n\nBest regards,\nAI Recruitment Team`;

    const html = isSelected
      ? `<p>Hi ${candidateName},</p><p>You have been selected for an interview.</p><p><b>Date:</b> ${date}<br><b>Time:</b> ${time}<br><b>Meeting Link:</b> <a href="${meetingLink}">${meetingLink}</a></p><p>Best regards,<br>AI Recruitment Team</p>`
      : `<p>Hi ${candidateName},</p><p>Thank you for your interest. After reviewing your profile, we have decided not to move forward with your application at this time.</p><p>Best regards,<br>AI Recruitment Team</p>`;

    console.log(`Sending ${decision} email to ${email}...`);
    
    try {
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        let host = process.env.SMTP_HOST;
        // Correct common typo: stmp -> smtp
        if (host.startsWith("stmp.")) {
          console.warn(`Detected typo in SMTP_HOST: "${host}". Correcting to "smtp.${host.substring(5)}"`);
          host = "smtp." + host.substring(5);
        }

        const transporter = nodemailer.createTransport({
          host: host,
          port: parseInt(process.env.SMTP_PORT || "587"),
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from: `"AI Recruitment" <${process.env.SMTP_USER}>`,
          to: email,
          subject: subject,
          text: text,
          html: html,
        });
      } else {
        console.log("SMTP credentials not found. Simulating email send.");
      }

      res.json({ 
        success: true, 
        message: "Email sent successfully!",
        preview: { subject, text, html }
      });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to send email",
        details: String(error)
      });
    }
  });

  // API: Analyze Resume
  app.post("/api/analyze-resume", async (req, res) => {
    try {
      const { resumeText, jobDescription } = req.body;
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following resume against the job description.
        
        Job Description:
        ${jobDescription}
        
        Resume:
        ${resumeText}
        
        Provide a match score (0-100), a decision (Selected or Rejected based on score >= 70), and 3 bullet points explaining the decision.
        Also extract the candidate's name and email address. Ensure the email address is a valid format. If no email is found, return an empty string for candidateEmail.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.OBJECT, properties: { value: { type: Type.NUMBER } } }, // Wrapping to be safe with some versions
              decision: { type: Type.STRING },
              explanation: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              candidateName: { type: Type.STRING },
              candidateEmail: { type: Type.STRING },
            },
            required: ["score", "decision", "explanation", "candidateName", "candidateEmail"],
          },
        },
      });

      const text = response.text;
      const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
      res.json(JSON.parse(cleanJson));
    } catch (error) {
      console.error("Analyze Resume Error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // API: Get Interview Question
  app.post("/api/interview-question", async (req, res) => {
    try {
      const { step, candidateName, jobDescription, resumeText, history } = req.body;
      const ai = getAI();
      const jd = jobDescription || "General role";
      const resume = resumeText || "Not provided";

      const systemPrompt = `You are an AI Interviewer conducting a real-time interview with ${candidateName}.
      Ask only ONE question at a time. This is question ${step + 1}.
      Job Description: ${jd}
      Candidate Resume: ${resume}`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { role: "user", parts: [{ text: systemPrompt }] },
          ...history.map((h: any) => ({
            role: h.role === "ai" ? "model" : "user",
            parts: [{ text: h.text }]
          }))
        ],
      });

      res.json({ text: response.text });
    } catch (error) {
      console.error("Interview Question Error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // API: Evaluate Interview
  app.post("/api/evaluate-interview", async (req, res) => {
    try {
      const { candidateName, jobDescription, history } = req.body;
      const ai = getAI();
      const conversation = history.map((h: any) => `${h.role === 'ai' ? 'Interviewer' : 'Candidate'}: ${h.text}`).join('\n');

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Evaluate this interview for ${candidateName}. Role: ${jobDescription}\n\nConversation:\n${conversation}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              candidateName: { type: Type.STRING },
              score: { type: Type.NUMBER },
              ratings: {
                type: Type.OBJECT,
                properties: {
                  technical: { type: Type.NUMBER },
                  communication: { type: Type.NUMBER },
                  confidence: { type: Type.NUMBER },
                },
                required: ["technical", "communication", "confidence"],
              },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendation: { type: Type.STRING },
              summary: { type: Type.STRING },
            },
            required: ["candidateName", "score", "ratings", "strengths", "weaknesses", "recommendation", "summary"],
          },
        },
      });

      const text = response.text;
      const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
      res.json(JSON.parse(cleanJson));
    } catch (error) {
      console.error("Evaluate Interview Error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
