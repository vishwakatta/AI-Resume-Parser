import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  Video, 
  User, 
  Send, 
  ArrowRight, 
  BarChart3, 
  Mail,
  Loader2,
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Lock,
  LayoutDashboard,
  LogOut,
  Briefcase
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster, toast } from "sonner";
import { extractTextFromPDF } from "@/src/lib/pdfParser";
import { analyzeResume, getInterviewQuestion, evaluateInterview } from "@/src/lib/gemini";
import ReactMarkdown from "react-markdown";

type Step = "login" | "setup" | "analysis" | "scheduling" | "interview" | "dashboard";

export default function App() {
  const [step, setStep] = useState<Step>("login");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [analysis, setAnalysis] = useState<any>(null);
  const [interviewHistory, setInterviewHistory] = useState<{ role: "ai" | "user"; text: string }[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userInput, setUserInput] = useState("");
  const [finalEvaluation, setFinalEvaluation] = useState<any>(null);
  const [meetingLink, setMeetingLink] = useState("");
  const [threshold, setThreshold] = useState(70);
  const [sentEmails, setSentEmails] = useState<any[]>([]);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            setUserInput(prev => prev + event.results[i][0].transcript);
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        setTranscript(interimTranscript);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  // Camera logic
  useEffect(() => {
    if (step === "interview") {
      const targetVideo = hasJoined ? videoRef.current : previewVideoRef.current;
      if (targetVideo) {
        navigator.mediaDevices.getUserMedia({ video: isCameraOn, audio: isMicOn })
          .then(stream => {
            if (targetVideo) {
              targetVideo.srcObject = stream;
            }
          })
          .catch(err => {
            console.error("Error accessing camera:", err);
          });
      }
    }
  }, [hasJoined, step, isCameraOn, isMicOn]);

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setUserInput("");
      setTranscript("");
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginEmail && loginPassword) {
      setIsAuthenticated(true);
      setStep("setup");
      toast.success("Welcome back, Recruiter!");
    } else {
      toast.error("Please enter valid credentials");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setStep("login");
    setLoginEmail("");
    setLoginPassword("");
  };

  useEffect(() => {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    
    if (path.startsWith("/interview/")) {
      const id = path.split("/").pop();
      if (id) {
        setInterviewId(id);
        setStep("interview");
        
        // Try URL params first (more reliable across tabs/browsers)
        const urlName = searchParams.get("name");
        const urlEmail = searchParams.get("email");
        const urlJD = searchParams.get("jd");
        
        // Then try localStorage
        const savedJD = localStorage.getItem(`jd_${id}`);
        const savedResume = localStorage.getItem(`resume_${id}`);
        const savedName = localStorage.getItem(`name_${id}`);
        
        if (savedJD) setJobDescription(savedJD);
        else if (urlJD) setJobDescription(urlJD);
        
        if (savedResume) setResumeText(savedResume);
        
        const finalName = urlName || savedName || "Candidate";
        setAnalysis({ 
          candidateName: finalName, 
          candidateEmail: urlEmail || "",
          decision: "Selected" 
        });

        // Speak a welcome message when they land
        setTimeout(() => {
          speak(`Welcome ${finalName}. Please check your microphone and camera, then click join when you are ready.`);
        }, 1000);
      }
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [interviewHistory]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setResumeFile(file);
      setLoading(true);
      try {
        if (file.type === "application/pdf") {
          const text = await extractTextFromPDF(file);
          setResumeText(text);
        } else {
          const text = await file.text();
          setResumeText(text);
        }
        toast.success("Resume uploaded and parsed successfully!");
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to parse resume.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleAnalyze = async () => {
    if (!resumeText || !jobDescription) {
      toast.error("Please provide both resume and job description.");
      return;
    }
    setLoading(true);
    try {
      const result = await analyzeResume(resumeText, jobDescription);
      // Override decision based on adjustable threshold
      result.decision = result.score >= threshold ? "Selected" : "Rejected";
      setAnalysis(result);
      setStep("analysis");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async () => {
    setLoading(true);
    const isSelected = analysis?.decision === "Selected";
    const id = Math.random().toString(36).substring(7);
    const queryParams = new URLSearchParams({
      name: analysis?.candidateName || "",
      email: analysis?.candidateEmail || "",
      jd: jobDescription.substring(0, 500),
    }).toString();
    
    const link = isSelected ? `${window.location.origin}/interview/${id}?${queryParams}` : "";
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!analysis?.candidateEmail || !emailRegex.test(analysis.candidateEmail)) {
      toast.error(`Invalid candidate email: ${analysis?.candidateEmail || 'Not found'}. Please check the resume.`);
      setLoading(false);
      return;
    }

    if (isSelected) {
      setMeetingLink(link);
      setInterviewId(id);
      // Save to localStorage for demo purposes (so the link works in the same browser)
      localStorage.setItem(`jd_${id}`, jobDescription);
      localStorage.setItem(`resume_${id}`, resumeText);
      localStorage.setItem(`name_${id}`, analysis?.candidateName || "");
    }
    
    try {
      const response = await fetch("/api/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: analysis?.candidateEmail,
          candidateName: analysis?.candidateName,
          decision: analysis?.decision,
          date: isSelected ? new Date(Date.now() + 86400000).toLocaleDateString() : null,
          time: isSelected ? "10:00 AM" : null,
          meetingLink: link
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success(`Email sent to ${analysis?.candidateEmail}`);
        
        // Add to history
        setSentEmails(prev => [{
          ...data.preview,
          to: analysis?.candidateEmail,
          timestamp: new Date().toLocaleTimeString(),
          decision: analysis?.decision
        }, ...prev]);

        if (isSelected) {
          setStep("scheduling");
        } else {
          setStep("setup");
          setResumeFile(null);
          setResumeText("");
          setAnalysis(null);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to send email");
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to send email.");
    } finally {
      setLoading(false);
    }
  };

  const startInterview = async () => {
    setStep("interview");
    setLoading(true);
    try {
      const name = analysis?.candidateName || "Candidate";
      const firstQuestion = await getInterviewQuestion(0, name, jobDescription, resumeText, []);
      const welcomeMsg = firstQuestion || `Hello ${name}, let's start the interview. Tell me about yourself.`;
      setInterviewHistory([{ role: "ai", text: welcomeMsg }]);
      speak(welcomeMsg);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || loading) return;

    const newHistory = [...interviewHistory, { role: "user" as const, text: userInput }];
    setInterviewHistory(newHistory);
    setUserInput("");
    setLoading(true);

    try {
      const nextIndex = currentQuestionIndex + 1;
      const name = analysis?.candidateName || "Candidate";
      
      if (nextIndex < 4) {
        const nextQuestion = await getInterviewQuestion(nextIndex, name, jobDescription, resumeText, newHistory);
        const aiMsg = nextQuestion || "Thank you. Next question...";
        setInterviewHistory([...newHistory, { role: "ai", text: aiMsg }]);
        setCurrentQuestionIndex(nextIndex);
        speak(aiMsg);
      } else {
        // End of interview
        const endMsg = "Thank you for your time. The interview is now complete. We will get back to you soon.";
        setInterviewHistory([...newHistory, { role: "ai", text: endMsg }]);
        speak(endMsg);
        const evaluation = await evaluateInterview(name, jobDescription, [...newHistory, { role: "ai", text: "Interview ended." }]);
        setFinalEvaluation(evaluation);
        setTimeout(() => setStep("dashboard"), 3000);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] p-4 md:p-8 font-sans">
      <Toaster position="top-center" />
      
      <header className="max-w-6xl mx-auto mb-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white">
            <BarChart3 size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">RecruitAI</h1>
        </div>
        <div className="flex gap-4 items-center">
          {isAuthenticated && (
            <Button variant="ghost" className="text-gray-500 hover:text-red-500" onClick={handleLogout}>
              <LogOut size={18} className="mr-2" /> Logout
            </Button>
          )}
          <div className="flex gap-2">
            {["setup", "analysis", "scheduling", "interview", "dashboard"].map((s, i) => (
              <div 
                key={s} 
                className={`w-2 h-2 rounded-full ${step === s ? 'bg-primary' : 'bg-gray-300'}`}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
        <AnimatePresence mode="wait">
          {step === "login" && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto mt-12"
            >
              <Card className="border-none shadow-2xl overflow-hidden">
                <div className="h-2 bg-primary w-full" />
                <CardHeader className="text-center space-y-2 pt-8">
                  <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-2 rotate-3">
                    <Lock size={32} />
                  </div>
                  <CardTitle className="text-3xl font-black tracking-tight">RecruitAI Pro</CardTitle>
                  <CardDescription>Enter your credentials to access the recruiter dashboard</CardDescription>
                </CardHeader>
                <CardContent className="p-8">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Email Address</label>
                      <Input 
                        type="email" 
                        placeholder="recruiter@company.com" 
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="h-12 border-gray-200 focus:ring-primary"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Password</label>
                      <Input 
                        type="password" 
                        placeholder="••••••••" 
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="h-12 border-gray-200 focus:ring-primary"
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full h-12 text-lg font-bold mt-4 shadow-lg shadow-primary/20">
                      Sign In <ArrowRight className="ml-2" size={20} />
                    </Button>
                  </form>
                </CardContent>
                <CardFooter className="bg-gray-50 p-6 text-center border-t border-gray-100">
                  <p className="text-xs text-gray-500 font-medium">
                    Secure Recruiter Portal • Enterprise Edition v3.1
                  </p>
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {step === "setup" && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="border-none shadow-xl shadow-gray-200/50">
                <CardHeader>
                  <CardTitle className="text-3xl">Start Recruitment</CardTitle>
                  <CardDescription>Upload a candidate resume and provide the job description to begin analysis.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold uppercase tracking-wider text-gray-500">Job Description</label>
                      <Textarea 
                        placeholder="Paste the job description here..." 
                        className="min-h-[200px] bg-gray-50 border-gray-200 focus:ring-primary"
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                      />
                    </div>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-gray-500">Selection Threshold ({threshold}%)</label>
                        <div className="flex items-center gap-4">
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={threshold} 
                            onChange={(e) => setThreshold(parseInt(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                          <span className="font-bold text-primary w-12 text-right">{threshold}%</span>
                        </div>
                        <p className="text-xs text-gray-400">Candidates scoring below this will be rejected.</p>
                      </div>
                      <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg">
                        <p className="text-[10px] text-amber-700 leading-tight">
                          <strong>Note:</strong> For real email delivery to inboxes, configure <code>SMTP_HOST</code>, <code>SMTP_USER</code>, and <code>SMTP_PASS</code> in the Secrets panel. Otherwise, emails are simulated and logged in the dashboard.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-gray-500">Candidate Resume</label>
                        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer relative">
                          <input 
                            type="file" 
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                            onChange={handleFileUpload}
                            accept=".pdf,.txt"
                          />
                          <div className="flex flex-col items-center gap-3">
                            {resumeFile ? (
                              <>
                                <FileText className="text-primary" size={32} />
                                <p className="text-sm font-medium truncate max-w-full">{resumeFile.name}</p>
                              </>
                            ) : (
                              <>
                                <Upload className="text-gray-400" size={32} />
                                <p className="text-xs text-gray-500">Upload PDF or Text resume</p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full h-12 text-lg font-semibold" 
                    onClick={handleAnalyze}
                    disabled={loading || !resumeText || !jobDescription}
                  >
                    {loading ? <Loader2 className="animate-spin mr-2" /> : <ArrowRight className="mr-2" />}
                    Analyze Candidate
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {step === "analysis" && analysis && (
            <motion.div
              key="analysis"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-1 border-none shadow-lg">
                  <CardHeader className="text-center">
                    <CardTitle>Match Score</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center pb-8">
                    <div className="relative w-32 h-32 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle
                          cx="64"
                          cy="64"
                          r="58"
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          className="text-gray-100"
                        />
                        <circle
                          cx="64"
                          cy="64"
                          r="58"
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          strokeDasharray={364.4}
                          strokeDashoffset={364.4 - (364.4 * (analysis?.score || 0)) / 100}
                          className="text-primary transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <span className="absolute text-4xl font-bold">{analysis?.score || 0}%</span>
                    </div>
                    <Badge className={`mt-6 px-4 py-1 text-sm ${analysis?.decision === 'Selected' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {analysis?.decision || "Pending"}
                    </Badge>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2 border-none shadow-lg">
                  <CardHeader>
                    <CardTitle>Analysis Summary</CardTitle>
                    <CardDescription>Candidate: {analysis?.candidateName || "Unknown"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-4">
                      {analysis?.explanation?.map((item: string, i: number) => (
                        <li key={i} className="flex items-start gap-3">
                          <CheckCircle2 className="text-green-500 shrink-0 mt-1" size={18} />
                          <p className="text-gray-700">{item}</p>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter className="flex gap-4">
                    <Button variant="outline" className="flex-1" onClick={() => setStep("setup")}>Back</Button>
                    <Button 
                      className={`flex-1 ${analysis?.decision === 'Selected' ? 'bg-primary' : 'bg-red-600 hover:bg-red-700'}`} 
                      onClick={handleSendEmail}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="animate-spin mr-2" /> : <Mail className="mr-2" />}
                      Send {analysis?.decision || "Decision"} Email
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            </motion.div>
          )}

          {step === "scheduling" && (
            <motion.div
              key="scheduling"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl mx-auto"
            >
              <Card className="border-none shadow-2xl overflow-hidden">
                <div className="h-2 bg-primary w-full" />
                <CardHeader className="text-center pt-8">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail size={32} />
                  </div>
                  <CardTitle className="text-2xl">Invitation Sent!</CardTitle>
                  <CardDescription>An interview invitation has been sent to {analysis?.candidateEmail}.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 p-8">
                  <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                      <span className="text-gray-500 font-medium">Candidate</span>
                      <span className="font-bold">{analysis?.candidateName}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                      <span className="text-gray-500 font-medium">Date</span>
                      <span className="font-bold">{new Date(Date.now() + 86400000).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 font-medium">Time</span>
                      <span className="font-bold">10:00 AM (PST)</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-gray-400">Meeting Link</label>
                    <div className="flex gap-2">
                      <Input value={meetingLink} readOnly className="bg-gray-50" />
                      <Button variant="outline" onClick={() => {
                        navigator.clipboard.writeText(meetingLink);
                        toast.success("Link copied!");
                      }}>Copy</Button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="p-8 pt-0">
                  <Button className="w-full h-12" onClick={startInterview}>
                    Join Interview as Recruiter <Video className="ml-2" size={18} />
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {step === "interview" && !hasJoined && (
            <motion.div
              key="join-interview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md mx-auto"
            >
              <Card className="border-none shadow-2xl">
                <CardHeader className="text-center">
                  <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                    <VideoIcon size={40} />
                  </div>
                  <CardTitle className="text-2xl">Ready to join?</CardTitle>
                  <CardDescription>
                    You are invited to an AI-powered interview for the role.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-black rounded-lg aspect-video flex flex-col items-center justify-center text-gray-400 overflow-hidden relative">
                    <video 
                      ref={previewVideoRef} 
                      autoPlay 
                      muted 
                      playsInline 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-4 left-4">
                      <Badge variant="secondary" className="bg-black/50 text-white border-none">Camera Preview</Badge>
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg text-center">
                    <p className="text-sm text-gray-500 mb-1">Candidate Name</p>
                    <p className="font-bold text-lg">{analysis?.candidateName || "Candidate"}</p>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button className="w-full h-12 text-lg" onClick={() => {
                    setHasJoined(true);
                    if (interviewHistory.length === 0) {
                      startInterview();
                    }
                  }}>
                    Join Interview Now
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {step === "interview" && hasJoined && (
            <motion.div
              key="interview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[700px]"
            >
              <div className="lg:col-span-1 space-y-6">
                <Card className="bg-black text-white border-none overflow-hidden aspect-video lg:aspect-square flex items-center justify-center relative">
                  <div className="absolute top-4 left-4 z-10">
                    <Badge variant="secondary" className="bg-white/20 backdrop-blur-md border-none text-white">AI Recruiter</Badge>
                  </div>
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                      <BarChart3 size={48} className="text-primary" />
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="w-1 h-4 bg-primary animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                  </div>
                </Card>
                
                <Card className="bg-gray-900 text-white border-none overflow-hidden aspect-video lg:aspect-square flex items-center justify-center relative">
                  <div className="absolute top-4 left-4 z-10">
                    <Badge variant="secondary" className="bg-white/20 backdrop-blur-md border-none text-white">Candidate: {analysis?.candidateName || "Candidate"}</Badge>
                  </div>
                  {hasJoined ? (
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      muted 
                      playsInline 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={48} className="text-gray-600" />
                  )}
                  <div className="absolute bottom-4 right-4 flex gap-2">
                    <Button 
                      size="icon" 
                      variant="secondary" 
                      className={`rounded-full border-none text-white ${isMicOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500 hover:bg-red-600'}`}
                      onClick={() => setIsMicOn(!isMicOn)}
                    >
                      {isMicOn ? (isListening ? <Mic size={18} className="text-red-500 animate-pulse" /> : <Mic size={18} />) : <MicOff size={18} />}
                    </Button>
                    <Button 
                      size="icon" 
                      variant="secondary" 
                      className={`rounded-full border-none text-white ${isCameraOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500 hover:bg-red-600'}`}
                      onClick={() => setIsCameraOn(!isCameraOn)}
                    >
                      {isCameraOn ? <VideoIcon size={18} /> : <VideoOff size={18} />}
                    </Button>
                  </div>
                </Card>
              </div>

              <Card className="lg:col-span-3 border-none shadow-xl flex flex-col overflow-hidden">
                <CardHeader className="border-b border-gray-100 bg-gray-50 flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    {isSpeaking ? 'AI Recruiter is speaking...' : 'Live Interview Session'}
                  </CardTitle>
                  <Badge variant="outline">Question {currentQuestionIndex + 1} of 4</Badge>
                </CardHeader>
                <CardContent className="flex-1 p-0 overflow-hidden bg-white">
                  <ScrollArea className="h-full p-6" ref={scrollRef}>
                    <div className="space-y-6">
                      {interviewHistory.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'ai' ? 'justify-start' : 'justify-end'}`}>
                          <div className={`max-w-[80%] p-4 rounded-2xl ${
                            msg.role === 'ai' 
                              ? 'bg-gray-100 text-gray-800 rounded-tl-none' 
                              : 'bg-primary text-white rounded-tr-none'
                          }`}>
                            <p className="text-xs font-bold mb-1 opacity-70">
                              {msg.role === 'ai' ? 'AI Recruiter' : (analysis?.candidateName || 'Candidate')}
                            </p>
                            <div className="markdown-body">
                              <ReactMarkdown>
                                {msg.text}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      ))}
                      {loading && (
                        <div className="flex justify-start">
                          <div className="bg-gray-100 p-4 rounded-2xl rounded-tl-none flex gap-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75" />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150" />
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
                <CardFooter className="p-6 border-t border-gray-100 bg-gray-50 space-y-4 flex-col">
                  {isListening && (
                    <div className="w-full bg-primary/5 p-3 rounded-lg border border-primary/20 animate-pulse mb-2">
                      <p className="text-[10px] text-primary font-bold uppercase mb-1">Live Transcript</p>
                      <p className="text-sm italic text-gray-700">{transcript || "Listening..."}</p>
                    </div>
                  )}
                  <div className="flex w-full gap-3">
                    <Button 
                      size="icon" 
                      variant={isListening ? "destructive" : "outline"} 
                      className={`rounded-full h-12 w-12 shrink-0 ${isListening ? 'animate-pulse shadow-lg shadow-red-200' : ''}`}
                      onClick={toggleListening}
                    >
                      {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                    </Button>
                    <Input 
                      placeholder={isListening ? "Listening to your voice..." : "Type your response or use the mic..."} 
                      className="flex-1 h-12 bg-white border-gray-200 focus:ring-primary"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    <Button className="h-12 px-6 rounded-xl" onClick={handleSendMessage} disabled={loading || (!userInput.trim() && !isListening)}>
                      <Send size={18} />
                    </Button>
                  </div>
                  <p className="text-[10px] text-center text-gray-400">
                    The AI will evaluate your technical knowledge, communication, and confidence.
                  </p>
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {step === "dashboard" && finalEvaluation && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                    <LayoutDashboard size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">Recruiter Dashboard</h2>
                    <p className="text-sm text-gray-500">Post-Interview Analysis & Evaluation</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <Badge className={`px-4 py-1.5 text-sm font-bold uppercase tracking-wider ${
                    finalEvaluation.recommendation === 'Select' ? 'bg-green-100 text-green-700 border-green-200' : 
                    finalEvaluation.recommendation === 'Hold' ? 'bg-amber-100 text-amber-700 border-amber-200' : 
                    'bg-red-100 text-red-700 border-red-200'
                  }`} variant="outline">
                    Recommendation: {finalEvaluation.recommendation}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-400 hover:text-red-500">
                    <LogOut size={18} />
                  </Button>
                </div>
              </div>

              {sentEmails.length > 0 && (
                <Card className="border-none shadow-lg bg-blue-50/30">
                  <CardHeader>
                    <CardTitle className="text-blue-700 flex items-center gap-2">
                      <Mail size={20} /> Sent Email Log (Real-time)
                    </CardTitle>
                    <CardDescription>History of emails sent to candidates during this session.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {sentEmails.map((email, i) => (
                        <div key={i} className="bg-white p-4 rounded-lg border border-blue-100 shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className="text-xs font-bold uppercase text-gray-400">To:</span>
                              <span className="ml-2 text-sm font-medium">{email.to}</span>
                            </div>
                            <Badge variant="outline" className="text-[10px]">{email.timestamp}</Badge>
                          </div>
                          <div className="text-sm font-bold mb-1">{email.subject}</div>
                          <div className="text-xs text-gray-600 line-clamp-2 italic">"{email.text}"</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle>Interview Score</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center py-6">
                    <div className="text-6xl font-black text-primary mb-2">{finalEvaluation.score}</div>
                    <div className="text-gray-500 font-medium">Out of 10</div>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2 border-none shadow-lg">
                  <CardHeader>
                    <CardTitle>Competency Ratings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      { label: "Technical Knowledge", value: finalEvaluation.ratings.technical },
                      { label: "Communication", value: finalEvaluation.ratings.communication },
                      { label: "Confidence", value: finalEvaluation.ratings.confidence },
                    ].map((r, i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex justify-between text-sm font-medium">
                          <span>{r.label}</span>
                          <span>{r.value}/10</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${r.value * 10}%` }}
                            transition={{ duration: 1, delay: i * 0.2 }}
                            className="h-full bg-primary"
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-green-600 flex items-center gap-2">
                      <CheckCircle2 size={20} /> Strengths
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {finalEvaluation.strengths.map((s: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                          <span className="text-green-500">•</span> {s}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-red-600 flex items-center gap-2">
                      <XCircle size={20} /> Weaknesses
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {finalEvaluation.weaknesses.map((w: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                          <span className="text-red-500">•</span> {w}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle>Executive Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-700 leading-relaxed italic">
                      "{finalEvaluation.summary}"
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-center pt-8">
                <Button variant="outline" size="lg" onClick={() => window.location.reload()}>
                  Start New Process
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
