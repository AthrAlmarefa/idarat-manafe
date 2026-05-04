"use client";
export const dynamic = "force-dynamic";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { ScheduledSession } from "@/types";

const SBG: Record<string,string> = { pending:"#FEF3C7", checked_in:"#D1FAE5", completed:"#DBEAFE", absent:"#FEE2E2" };
const SFG: Record<string,string> = { pending:"#92400E", checked_in:"#065F46", completed:"#1E40AF", absent:"#991B1B" };
const SLB: Record<string,string> = { pending:"لم يبدأ", checked_in:"حضر", completed:"مكتمل", absent:"غائب" };
const ALB: Record<string,string> = { lesson:"درس", recitation:"تلاوة", friday_sermon:"خطبة جمعة", visit:"زيارة", other:"أخرى" };
interface Topic { id: string; sequence_num: number; axis: string; topic: string; priority: string; }

export default function PreacherPage() {
  const { user, loading } = useAuth();
  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [fetching, setFetching] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [actionLoading, setActionLoading] = useState<string|null>(null);
  const [modal, setModal] = useState<ScheduledSession|null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [males, setMales] = useState(0);
  const [females, setFemales] = useState(0);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [livePhotoModal, setLivePhotoModal] = useState<{sessionId:string}|null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string|null>(null);
  const [gpsStatus, setGpsStatus] = useState("");
  const [gpsCoords, setGpsCoords] = useState<{lat:number;lng:number}|null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { if (user) fetchSessions(); }, [user, selectedDate]);

  const fetchSessions = async () => {
    setFetching(true);
    const { data } = await supabase.from("scheduled_sessions")
      .select("*, locations(name,city)").eq("preacher_id", user!.id)
      .eq("scheduled_date", selectedDate).order("scheduled_time");
    setSessions(data || []);
    setFetching(false);
  };

  if (loading) return <div className="loading-screen"><div className="spinner"></div></div>;
  const total = sessions.reduce((s,x)=>s+x.beneficiaries_male+x.beneficiaries_female,0);

  return (
    <div className="page">
      <Header title="جدول الداعية" />
      <div className="container">
        <div className="card date-row">
          <span style={{fontWeight:700,fontSize:14}}>📅 التاريخ</span>
          <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} className="date-input" dir="ltr" />
        </div>
        {fetching?(<div style={{display:"flex",justifyContent:"center",padding:40}}><div className="spinner"></div></div>):sessions.length===0?(
          <div className="card empty-state"><div className="empty-state-icon">📅</div><p className="empty-state-title">لا توجد جلسات لهذا اليوم</p></div>
        ):sessions.map(s=>(
          <div key={s.id} className="card session-card">
            <p style={{fontWeight:800,fontSize:15}}>{s.planned_title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}