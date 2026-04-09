import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing from process.env");
      throw new Error("API key not found. Please ensure GEMINI_API_KEY is set in your environment.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

export const analyzeResume = async (resumeText: string, jobDescription: string) => {
  try {
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
            score: { type: Type.NUMBER },
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
    if (!text) throw new Error("Empty response from AI");
    
    // Clean potential markdown wrapping
    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Analyze Resume Error:", error);
    throw new Error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const getInterviewQuestion = async (
  step: number,
  candidateName: string,
  jobDescription: string,
  resumeText: string,
  history: { role: string; text: string}[]
) => {
  try {
    const ai = getAI();
    const jd = jobDescription || "General role";
    const resume = resumeText || "Not provided (Focus on general behavioral and role-specific questions)";

    const systemPrompt = `You are an AI Interviewer conducting a real-time interview with ${candidateName}.
    
    Your responsibilities:
    1. Interview Setup:
    - Greet the candidate professionally
    - Briefly explain the interview process
    - Ensure the candidate is ready (camera + microphone enabled)
    
    2. Interview Flow:
    - Ask questions one by one based on the job description and candidate resume.
    - Job Description: ${jd}
    - Candidate Resume: ${resume}
    - Start with basic introduction questions.
    - Gradually move to technical and role-specific questions.
    - Ask follow-up questions based on candidate responses.
    - Keep questions clear and concise.
    
    3. Interaction Rules:
    - Wait for the candidate to finish speaking before continuing.
    - If the candidate is silent for too long, gently prompt them.
    - If the answer is unclear, ask for clarification.
    - Maintain a polite, neutral, and professional tone.
    - Ask only ONE question at a time.
    
    4. Current Context:
    - This is question ${step + 1} of the interview.
    - Maintain a natural and conversational tone.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [{ text: systemPrompt }],
        },
        ...history.map(h => ({
          role: h.role === "ai" ? "model" : "user",
          parts: [{ text: h.text }]
        }))
      ],
    });

    if (!response.text) {
      console.error("Gemini returned empty text response:", response);
      throw new Error("Empty response from AI");
    }

    return response.text;
  } catch (error) {
    console.error("Detailed Get Interview Question Error:", error);
    // Return a more helpful message if it's a known error type
    if (error instanceof Error && (error.message.includes("API key") || error.message.includes("GEMINI_API_KEY"))) {
      return "I'm having trouble with my AI configuration. Please ensure the GEMINI_API_KEY is correctly set in the AI Studio Secrets panel.";
    }
    return "I'm sorry, I'm having trouble connecting. Could you please repeat that or wait a moment?";
  }
};

export const evaluateInterview = async (
  candidateName: string,
  jobDescription: string,
  history: { role: string; text: string }[]
) => {
  try {
    const ai = getAI();
    const conversation = history.map(h => `${h.role === 'ai' ? 'Interviewer' : 'Candidate'}: ${h.text}`).join('\n');

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a Senior Recruiter evaluating an interview for ${candidateName} for the following role:
      ${jobDescription}
      
      Analyze the following conversation and provide a structured evaluation.
      
      Conversation:
      ${conversation}
      
      Evaluation Criteria:
      - Communication skills
      - Technical knowledge
      - Confidence
      - Problem-solving ability
      
      The overall score should be out of 10.
      The recommendation must be one of: Select, Reject, Hold.
      Provide a summary of 3-5 lines.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            candidateName: { type: Type.STRING },
            score: { type: Type.NUMBER, description: "Overall score out of 10" },
            ratings: {
              type: Type.OBJECT,
              properties: {
                technical: { type: Type.NUMBER, description: "Technical Skills (0-10)" },
                communication: { type: Type.NUMBER, description: "Communication (0-10)" },
                confidence: { type: Type.NUMBER, description: "Confidence (0-10)" },
              },
              required: ["technical", "communication", "confidence"],
            },
            strengths: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            weaknesses: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            recommendation: { type: Type.STRING, description: "Select, Reject, or Hold" },
            summary: { type: Type.STRING, description: "3-5 line summary" },
          },
          required: ["candidateName", "score", "ratings", "strengths", "weaknesses", "recommendation", "summary"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Evaluate Interview Error:", error);
    throw new Error(`Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
