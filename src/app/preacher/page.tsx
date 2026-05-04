"use client";
export const dynamic = "force-dynamic";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { ScheduledSession } from "@/types";

const SBG: Record<string,string> = { pending:"#FEF3C7", checked_in:"#D1FAE5", completed:"#DBEAFE", absent:"#FEE2E2" };
const SFG: Record<string,string> = { pending:"#92400E", checked_in:"#065F46", completed:"#1E40AF", absent:"#991B1B" };
const SLB: Record<string,string> = { pending:"لم يبدأ", checked_in:"حضر", completed:"مكتمل", absent:"غا٦ب" };
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

  const fetchTopics = async () => {
    if (!user) return;
    setLoadingTopics(true);
    const { data: userData } = await supabase.from("users").select("arrival_period_id").eq("id", user.id).single();
    if (userData?.arrival_period_id) {
      const { data } = await supabase.from("teaching_plan_topics")
        .select("id,sequence_num,axis,topic,priority").eq("period_id", userData.arrival_period_id)
        .eq("is_active", true).order("sequence_num");
      setTopics(data || []);
    } else {
      const { data } = await supabase.from("teaching_plan_topics")
        .select("id,sequence_num,axis,topic,priority").eq("is_active", true).order("sequence_num");
      setTopics(data || []);
    }
    setLoadingTopics(false);
  };

  const openStatsModal = async (s: ScheduledSession) => {
    setModal(s); setSelectedTopic(s.planned_title||""); setCustomTitle(""); setShowCustom(false);
    setMales(s.beneficiaries_male||0); setFemales(s.beneficiaries_female||0);
    await fetchTopics();
  };

  const saveStats = async () => {
    if (!modal) return;
    const finalTitle = showCustom ? customTitle : selectedTopic;
    if (!finalTitle.trim()) { alert("يرجى اختيار عنوان امدرس"); return; }
    const u: Record<string,unknown> = { beneficiaries_male:males, beneficiaries_female:females, status:"completed" };
    if (finalTitle !== modal.planned_title) { u.executed_title=finalTitle; u.title_status="pending_approval"; }
    await supabase.from("scheduled_sessions").update(u).eq("id", modal.id);
    setModal(null); fetchSessions();
  };

  const openLivePhoto = async (sessionId: string) => {
    setLivePhotoModal({ sessionId }); setCapturedPhoto(null); setGpsStatus("جاري تحديد موقعك..."); setGpsCoords(null);
    navigator.geolocation?.getCurrentPosition(
      p => { setGpsCoords({lat:p.coords.latitude,lng:p.coords.longitude}); setGpsStatus("✓ تم تحديد اموقعك"); },
      () => setGpsStatus("⚠️ لم يتم تحديد اموقعك"), {enableHighAccuracy:true,timeout:10000}
    );
    try {
      const s = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});
      streamRef.current=s; if(videoRef.current){videoRef.current.srcObject=s;videoRef.current.play();}
    } catch {/* */}
  };

  const capturePhoto = () => {
    if (!videoRef.current||!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    canvasRef.current.width=videoRef.current.videoWidth; canvasRef.current.height=videoRef.current.videoHeight;
    ctx?.drawImage(videoRef.current,0,0);
    setCapturedPhoto(canvasRef.current.toDataURL("image/jpeg",0.8));
    streamRef.current?.getTracks().forEach(t=>t.stop());
  };

  const closeLivePhoto = () => { streamRef.current?.getTracks().forEach(t=>t.stop()); streamRef.current=null; setLivePhotoModal(null); setCapturedPhoto(null); };

  const uploadLivePhoto = async () => {
    if (!capturedPhoto||!livePhotoModal) return;
    setUploading(true);
    const blob = await (await fetch(capturedPhoto)).blob();
    const path = `${user!.id}/${livePhotoModal.sessionId}/live-${Date.now()}.jpg`;
    const {data:up} = await supabase.storage.from("session-media").upload(path,blob,{contentType:"image/jpeg"});
    if (up) {
      const {data:{publicUrl}} = supabase.storage.from("session-media").getPublicUrl(up.path);
      await supabase.from("session_media").insert({session_id:livePhotoModal.sessionId,uploaded_by:user!.id,file_url:publicUrl,file_type:"image",file_name:"صورة حية.jpg",is_live_photo:true,latitude:gpsCoords?.lat,longitude:gpsCoords?.lng});
      await supabase.from("scheduled_sessions").update({status:"checked_in",checked_in_at:new Date().toISOString()}).eq("id",livePhotoModal.sessionId);
    }
    setUploading(false); closeLivePhoto(); fetchSessions();
  };

  const pColor: Record<string,string> = {"رئيسي":"#1B6B3A","ثانوي":"#1D4ED8","اختياري":"#6B7280"};
  const pBg: Record<string,string> = {"رئيسي":"#F0FFF4","ثانوي":"#EFF6FF","اختياري":"#F9FAFB"};

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
        {sessions.length>0&&(
          <div className="grid-3" style={{marginBottom:16}}>
            {[{label:"املارحا",value:sessions.length,color:"#1B6B3A"},{label:"اممستفيدون",value:total,color:"#C9A84C"},{label:"مكتملة",value:sessions.filter(s=>s.status==="completed").length,color:"#1D4ED8"}].map(s=>(
              <div key={s.label} className="stat-card"><div className="stat-number" style={{color:s.color}}>{s.value}</div><div className="stat-label">{s.label}</div></div>
            ))}
          </div>
        )}
        {fetching?(<div style={{display:"flex",justifyContent:"center",padding:40}}><div className="spinner"></div></div>):sessions.length===0?(
          <div className="card empty-state"><div className="empty-state-icon">📅</div><p className="empty-state-title">لا توجد جلسات لهظا الىوم</p></div>
        ):sessions.map(s=>(
          <div key={s.id} className="card session-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontWeight:800,fontSize:15,color:"#111827"}}>{s.planned_title}</p>
                {s.executed_title&&s.executed_title!==s.planned_title&&(
                  <p style={{fontSize:12,color:"#D97706",marginTop:4}}>✏️ منفذ: {s.executed_title} {s.title_status==="pending_approval"?"⏳":""}</p>
                )}
              </div>
              <span className="badge" style={{background:SBG[s.status],color:SFG[s.status]}}>{SLB[s.status]}</span>
            </div>
            <div className="session-meta">
              <span className="session-meta-item">🕐 {s.scheduled_time?.slice(0,5)}</span>
              <span className="session-meta-item">📍 {(s.locations as {name:string}|null)?.name}</span>
              <span className="session-meta-item">📚 {ALB[s.activity_type]}</span>
            </div>
            {(s.beneficiaries_male>0||s.beneficiaries_female>0)&&(
              <div style={{background:"#F0FFF4",borderRadius:10,padding:"8px 14px",display:"flex",gap:20,marginBottom:10}}>
                <span style={{fontSize:13,color:"#1D4ED8",fontWeight:700}}>👨 {s.beneficiaries_male}</span>
                <span style={{fontSize:13,color:"#BE185D",fontWeight:700}}>👩 {s.beneficiaries_female}</span>
                <span style={{fontSize:13,color:"#059669",fontWeight:700}}>= {s.beneficiaries_male+s.beneficiaries_female}</span>
              </div>
            )}
            <div className="session-actions">
              {s.status==="pending"&&(<button onClick={()=>openLivePhoto(s.id)} disabled={actionLoading===s.id} className="btn-primary" style={{minHeight:44,fontSize:14}}>📸 تسجيل حضور بصورة حية</button>)}
              {s.status==="checked_in"&&(<button onClick={()=>openStatsModal(s)} className="btn-primary" style={{minHeight:44,fontSize:14}}>📊 إدخال الإحصائيات والعنوان</button>)}
              {(s.status==="checked_in"||s.status==="completed")&&(<button onClick={()=>{window.location.href=`/preacher/media?session=${s.id}`;}} className="btn-icon" style={{background:"#EFF6FF",color:"#1D4ED8",width:44,height:44}}>🖼️</button>)}
            </div>
          </div>
        ))}
      </div>

      {modal&&(
        <div className="modal-overlay">
          <div className="modal-box">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <h3 style={{fontWeight:800,fontSize:17}}>إدخال إحصائيات الجلسة</h3>
              <button onClick={()=>setModal(null)} style={{background:"#F3F4F6",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <p style={{fontSize:12,color:"#6B7280",marginBottom:16}}>{modal.planned_title}</p>
            <div className="form-group" style={{marginBottom:14}}>
              <label className="form-label">📚 اختر عنوان الدرس اممنفذ</label>
              {loadingTopics?(
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0"}}>
                  <div className="spinner spinner-sm"></div><span style={{fontSize:13,color:"#6B7280"}}>جاري تحميل مواضيع فترتك...</span>
                </div>
              ):(
                <>
                  <div style={{maxHeight:260,overflowY:"auto",border:"1.5px solid #E5E7EB",borderRadius:14,background:"white"}}>
                    {Array.from(new Set(topics.map(t=>t.axis))).map(axis=>(
                      <div key={axis}>
                        <div style={{padding:"8px 14px",background:"#F3F4F6",borderBottom:"1px solid #E5E7EB",position:"sticky",top:0}}>
                          <p style={{fontSize:11,fontWeight:800,color:"#374151"}}>{axis}</p>
                        </div>
                        {topics.filter(t=>t.axis===axis).map(t=>(
                          <button key={t.id} onClick={()=>{setSelectedTopic(t.topic);setShowCustom(false);}} style={{
                            width:"100%",padding:"10px 14px",textAlign:"right",border:"none",
                            borderBottom:"1px solid #F9FAFB",cursor:"pointer",fontFamily:"Cairo,sans-serif",
                            background:selectedTopic===t.topic&&!showCustom?pBg[t.priority]||"#F0FFF4":"white",
                            display:"flex",alignItems:"center",gap:8,
                          }}>
                            <span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:20,flexShrink:0,background:pBg[t.priority]||"#F9FAFB",color:pColor[t.priority]||"#6B7280"}}>{t.priority}</span>
                            <span style={{fontSize:13,flex:1,textAlign:"right",fontWeight:selectedTopic===t.topic&&!showCustom?700:400,color:selectedTopic===t.topic&&!showCustom?pColor[t.priority]||"#1B6B3A":"#374151"}}>{t.topic}</span>
                            {selectedTopic===t.topic&&!showCustom&&<span style={{color:"#1B6B3A",fontSize:16,flexShrink:0}}>✓</span>}
                          </button>
                        ))}
                      </div>
                    ))}
                    <button onClick={()=>{setShowCustom(true);setSelectedTopic("");}} style={{
                      width:"100%",padding:"12px 14px",textAlign:"right",border:"none",
                      cursor:"pointer",fontFamily:"Cairo,sans-serif",background:showCustom?"#FEF3C7":"white",
                      display:"flex",alignItems:"center",gap:8,borderTop:"1px solid #E5E7EB",
                    }}>
                      <span style={{fontSize:18}}>✏️</span>
                      <span style={{fontSize:13,fontWeight:showCustom?700:400,color:showCustom?"#92400E":"#374151"}}>غير ذمك ℔ أدخل عنوان مختلف</span>
                      {showCustom&&<span style={{color:"#D97706",fontSize:16,marginRight:"auto"}}>✓</span>}
                    </button>
                  </div>
                  {showCustom&&(
                    <input className="input-field" style={{marginTop:10}} placeholder="اكتب عنوان امدرس المنفذ..." value={customTitle} onChange={e=>setCustomTitle(e.target.value)} autoFocus />
                  )}
                  {(selectedTopic||(showCustom&&customTitle))&&(
                    <div style={{marginTop:8,background:"#F0FFF4",borderRadius:10,padding:"8px 12px",border:"1px solid #A7F3D0"}}>
                      <p style={{fontSize:11,color:"#065F46",fontWeight:700,marginBottom:2}}>✓ امعنوان اممختار</p>
                      <p style={{fontSize:13,fontWeight:700,color:"#1B6B3A"}}>{showCustom?customTitle:selectedTopic}</p>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="grid-2" style={{marginBottom:14}}>
              <div className="form-group"><label className="form-label" style={{color:"#1D4ED8"}}>رجال 👨</label><input className="input-field" type="number" min={0} value={males} onChange={e=>setMales(+e.target.value)} /></div>
              <div className="form-group"><label className="form-label" style={{color:"#BE185D"}}>نساء 👩</label><input className="input-field" type="number" min={0} value={females} onChange={e=>setFemales(+e.target.value)} /></div>
            </div>
            <div style={{background:"#F0FFF4",borderRadius:12,padding:"10px",textAlign:"center",marginBottom:16}}>
              <p style={{fontSize:22,fontWeight:900,color:"#059669"}}>{males+females}</p>
              <p style={{fontSize:12,color:"#6B7280"}}>إجمالي المستفيدين</p>
            </div>
            <div className="form-actions">
              <button onClick={saveStats} className="btn-primary">✓ حفظ</button>
              <button onClick={()=>setModal(null)} className="btn-secondary">إملصء</button>
            </div>
          </div>
        </div>
      )}

      {livePhotoModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:200,display:"flex",flexDirection:"column"}}>
          <div style={{padding:"16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <p style={{color:"white",fontWeight:700,fontSize:16}}>📸 صورة حية لإثبات التواجد</p>
            <button onClick={closeLivePhoto} style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:10,color:"white",fontSize:20,width:40,height:40,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{flex:1,position:"relative",overflow:"hidden"}}>
            {!capturedPhoto?(<video ref={videoRef} style={{width:"100%",height:"100%",objectFit:"cover"}} autoPlay playsInline muted />):
            // eslint-disable-next-line @next/next/no-img-element
            (<img src={capturedPhoto} alt="captured" style={{width:"100%",height:"100%",objectFit:"cover"}} />)}
            <canvas ref={canvasRef} style={{display:"none"}} />
            {gpsStatus&&(<div style={{position:"absolute",top:12,right:12,background:"rgba(0,0,0,0.6)",borderRadius:10,padding:"6px 12px"}}><p style={{color:"white",fontSize:12,fontWeight:600}}>📍 {gpsStatus}</p></div>)}
          </div>
          <div style={{padding:"20px 16px",display:"flex",gap:12}}>
            {!capturedPhoto?(
              <button onClick={capturePhoto} style={{flex:1,height:56,borderRadius:16,background:"white",color:"#111827",border:"none",cursor:"pointer",fontSize:16,fontWeight:800,fontFamily:"Cairo,sans-serif"}}>📷 التقاط الصورة</button>
            ):(
              <>
                <button onClick={()=>{setCapturedPhoto(null);openLivePhoto(livePhotoModal.sessionId);}} style={{flex:1,height:56,borderRadius:16,background:"rgba(255,255,255,0.2)",color:"white",border:"none",cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:"Cairo,sans-serif"}}>إغادة</button>
                <button onClick={uploadLivePhoto} disabled={uploading} style={{flex:2,height:56,borderRadius:16,background:"#1B6B3A",color:"white",border:"none",cursor:"pointer",fontSize:14,fontWeight:800,fontFamily:"Cairo,sans-serif",opacity:uploading?0.6:1}}>
                  {uploading?"جاري الرفع...":"✓ تأكيد وتسجيل الحضور"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
