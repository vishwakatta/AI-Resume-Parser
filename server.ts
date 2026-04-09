import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

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
