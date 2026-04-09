export const analyzeResume = async (resumeText: string, jobDescription: string) => {
  try {
    const response = await fetch("/api/analyze-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText, jobDescription }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to analyze resume");
    }
    
    const data = await response.json();
    // Handle the wrapped score if necessary (matching the server-side schema change)
    if (data.score && typeof data.score === 'object' && 'value' in data.score) {
      data.score = data.score.value;
    }
    return data;
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
    const response = await fetch("/api/interview-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, candidateName, jobDescription, resumeText, history }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to get interview question");
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error("Get Interview Question Error:", error);
    if (error instanceof Error && error.message.includes("API key")) {
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
    const response = await fetch("/api/evaluate-interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateName, jobDescription, history }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to evaluate interview");
    }

    return await response.json();
  } catch (error) {
    console.error("Evaluate Interview Error:", error);
    throw new Error(`Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
