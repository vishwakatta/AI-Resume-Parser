import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
  if (!aiInstance) {
    // Standard pattern for AI Studio: process.env.GEMINI_API_KEY is injected at runtime.
    // We avoid build-time 'define' to let the platform's shim work.
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      throw new Error("Gemini API key not found. Please ensure it is configured in the AI Studio Secrets panel.");
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
    const resume = resumeText || "Not provided";

    const systemPrompt = `You are an AI Interviewer conducting a real-time interview with ${candidateName}.
    Ask only ONE question at a time. This is question ${step + 1}.
    Job Description: ${jd}
    Candidate Resume: ${resume}`;

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
      throw new Error("Empty response from AI");
    }

    return response.text;
  } catch (error) {
    console.error("Get Interview Question Error:", error);
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
    if (!text) throw new Error("Empty response from AI");
    
    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Evaluate Interview Error:", error);
    throw new Error(`Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
