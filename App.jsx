import { useState, useMemo, useRef, useCallback } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, LineChart, Line } from "recharts";
import { Plus, Trash2, Edit3, Package, BookOpen, TrendingUp, Calculator, Download, AlertTriangle, CheckCircle, Search, X, Save, ArrowUpRight, ArrowDownRight, Users, Upload, Zap, HelpCircle, CreditCard, Building, Wallet, FileSpreadsheet, RefreshCw, ArrowRight, Info, ChevronDown } from "lucide-react";

/* ═══════════════════════════════════════════════
   BizBoard Pro v4.0
   クレカCSV取込 × 銀行残高管理 × 青色申告
   「マネーフォワードではできない」をこの1アプリで。
═══════════════════════════════════════════════ */

// ===== 勘定科目ルール（クレカ明細対応を強化） =====
const RULES = [
  { kw: ["仕入","商品購入","買付","原価","ASIN","商品代","alibaba","アリババ","1688","タオバオ","義烏","イーウー"], acct: "仕入高" },
  { kw: ["送料","配送","宅配","FBA納品","ヤマト","佐川","郵便","納品","荷造","梱包","段ボール","緩衝材","テープ","FBA配送","発送"], acct: "荷造運賃" },
  { kw: ["Amazon手数料","販売手数料","FBA手数料","保管料","カテゴリ手数料","成約料","振込手数料","決済手数料","Stripe","PayPal"], acct: "支払手数料" },
  { kw: ["広告","スポンサー","プロモ","Instagram","Facebook","PR","SNS広告","Google広告","META","TikTok","X広告"], acct: "広告宣伝費" },
  { kw: ["ツール","サブスク","月額","セラースプライト","keepa","Canva","Adobe","ChatGPT","クラウド","サーバー","ドメイン","WiFi","ネット","電話","スマホ","回線","通信","NTT","KDDI","SoftBank","楽天モバイル","AWS","Zoom","Slack","Notion"], acct: "通信費" },
  { kw: ["文房具","用紙","プリンター","インク","事務用品","PC周辺","USB","マウス","キーボード","モニター","100均","ダイソー","セリア"], acct: "消耗品費" },
  { kw: ["交通","電車","バス","タクシー","ガソリン","高速","駐車","Suica","PASMO","ICOCA","JR","新幹線","飛行機","ANA","JAL"], acct: "旅費交通費" },
  { kw: ["外注","デザイン","ライティング","代行","業務委託","ランサーズ","クラウドワークス","ココナラ","Fiverr"], acct: "外注工賃" },
  { kw: ["家賃","オフィス","コワーキング","レンタルオフィス","WeWork"], acct: "地代家賃" },
  { kw: ["電気","ガス","水道","光熱","東京電力","関西電力","東京ガス","大阪ガス"], acct: "水道光熱費" },
  { kw: ["書籍","セミナー","勉強","講座","教材","コンサル","スクール","Udemy","Amazon Kindle","本"], acct: "研修費" },
  { kw: ["接待","会食","飲食","打ち合わせ","お土産","贈答","スタバ","カフェ","レストラン"], acct: "接待交際費" },
  { kw: ["保険","国民健康","生命保険"], acct: "保険料" },
  { kw: ["減価償却","パソコン","PC本体","カメラ","iPhone","iPad","MacBook"], acct: "減価償却費" },
];
const detect = (desc) => {
  const d = (desc || "").toLowerCase();
  for (const r of RULES) { if (r.kw.some(k => d.includes(k.toLowerCase()))) return r.acct; }
  return "雑費";
};

// ===== クレカCSV列名マッピング =====
const CC_MAPPINGS = {
  rakuten: { name: "楽天カード", date: "利用日", desc: "利用店名・商品名", amount: "利用金額", encoding: "Shift_JIS" },
  smbc: { name: "三井住友カード", date: "ご利用日", desc: "ご利用先など", amount: "ご利用金額", encoding: "Shift_JIS" },
  jcb: { name: "JCB", date: "利用日", desc: "利用先", amount: "利用金額", encoding: "Shift_JIS" },
  amex: { name: "アメックス", date: "日付", desc: "ご利用先/概要", amount: "金額", encoding: "UTF-8" },
  auto: { name: "自動検出", date: null, desc: null, amount: null, encoding: "UTF-8" },
};

const SOURCES = [
  { id: "amazon", name: "Amazon物販", icon: "📦", color: "#FF9900" },
  { id: "sns", name: "SNS関連", icon: "📱", color: "#E1306C" },
  { id: "support", name: "バックサポート", icon: "🤝", color: "#4A90D9" },
  { id: "other", name: "その他", icon: "💼", color: "#34C759" },
];
const TEMPLATES = [
  { label: "商品仕入れ", desc: "商品仕入れ", src: "amazon" },
  { label: "FBA送料", desc: "FBA納品送料", src: "amazon" },
  { label: "Amazon手数料", desc: "Amazon販売手数料", src: "amazon" },
  { label: "広告費", desc: "SNS広告費", src: "sns" },
  { label: "外注費", desc: "外注費", src: "support" },
  { label: "ツール代", desc: "ツール月額", src: "amazon" },
  { label: "交通費", desc: "交通費", src: "amazon" },
  { label: "通信費", desc: "通信費", src: "amazon" },
  { label: "梱包材", desc: "梱包資材購入", src: "amazon" },
];
const MONTHS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const C8 = ["#FF9900","#E1306C","#4A90D9","#34C759","#AF52DE","#FF3B30","#5856D6","#FF2D55"];
const fmt = n => `¥${(n||0).toLocaleString()}`;

const mkData = pf => ({
  sales: MONTHS.map(m => ({
    month: m, amazon: Math.floor(Math.random()*500000)+200000,
    sns: Math.floor(Math.random()*150000)+30000,
    support: Math.floor(Math.random()*200000)+80000,
    other: Math.floor(Math.random()*80000)+10000,
  })),
  expenses: [
    { id:`${pf}-1`, date:"2025-03-01", desc:"商品仕入れ（Amazon FBA）", amt:150000, src:"amazon", rcpt:true, memo:"", origin:"manual" },
    { id:`${pf}-2`, date:"2025-03-03", desc:"FBA納品送料 ヤマト運輸", amt:8500, src:"amazon", rcpt:true, memo:"", origin:"manual" },
    { id:`${pf}-3`, date:"2025-03-05", desc:"Amazon販売手数料", amt:45000, src:"amazon", rcpt:true, memo:"3月分", origin:"amazon" },
    { id:`${pf}-4`, date:"2025-03-07", desc:"Instagram広告 META", amt:30000, src:"sns", rcpt:true, memo:"", origin:"creditcard" },
    { id:`${pf}-5`, date:"2025-03-10", desc:"セラースプライト月額", amt:5980, src:"amazon", rcpt:true, memo:"", origin:"creditcard" },
    { id:`${pf}-6`, date:"2025-03-12", desc:"通信費 NTTドコモ", amt:4500, src:"amazon", rcpt:true, memo:"家事按分50%", origin:"creditcard" },
    { id:`${pf}-7`, date:"2025-03-15", desc:"外注費 クラウドワークス", amt:50000, src:"sns", rcpt:false, memo:"請求書待ち", origin:"manual" },
    { id:`${pf}-8`, date:"2025-03-18", desc:"交通費 JR東日本", amt:3200, src:"amazon", rcpt:true, memo:"", origin:"manual" },
    { id:`${pf}-9`, date:"2025-03-20", desc:"梱包資材 ダンボールワン", amt:4800, src:"amazon", rcpt:true, memo:"", origin:"creditcard" },
    { id:`${pf}-10`, date:"2025-03-22", desc:"Notion月額 サブスク", amt:2980, src:"support", rcpt:true, memo:"", origin:"creditcard" },
  ],
  inventory: [
    { id:`${pf}-i1`, sku:"AMZ-001", name:"ワイヤレスイヤホン", cost:1200, price:3980, fba:120, self:30, rp:50 },
    { id:`${pf}-i2`, sku:"AMZ-002", name:"スマホスタンド", cost:380, price:1580, fba:250, self:50, rp:100 },
    { id:`${pf}-i3`, sku:"AMZ-003", name:"LEDデスクライト", cost:2500, price:6980, fba:40, self:5, rp:30 },
    { id:`${pf}-i4`, sku:"AMZ-004", name:"USB-Cハブ", cost:1800, price:4280, fba:180, self:20, rp:60 },
    { id:`${pf}-i5`, sku:"AMZ-005", name:"防水ポーチ", cost:450, price:1980, fba:10, self:5, rp:50 },
  ],
  bank: [
    { id:`${pf}-b1`, date:"2025-03-01", name:"Amazon入金（2月分）", amount: 580000, type: "income" },
    { id:`${pf}-b2`, date:"2025-03-05", name:"クレカ引落（楽天カード）", amount: -245000, type: "expense" },
    { id:`${pf}-b3`, date:"2025-03-10", name:"バックサポート報酬入金", amount: 150000, type: "income" },
    { id:`${pf}-b4`, date:"2025-03-15", name:"家賃（家事按分30%）", amount: -36000, type: "expense" },
    { id:`${pf}-b5`, date:"2025-03-20", name:"SNS案件入金", amount: 85000, type: "income" },
    { id:`${pf}-b6`, date:"2025-03-25", name:"仕入代金 振込", amount: -180000, type: "expense" },
  ],
  bankBalance: 1250000,
});

// ===== メイン =====
export default function App() {
  const [acct, setAcct] = useState("assistant");
  const [target, setTarget] = useState("owner");
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState({ owner: mkData("own"), assistant: mkData("ast") });
  const [showForm, setShowForm] = useState(false);
  const [showInvForm, setShowInvForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editInv, setEditInv] = useState(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [exportOk, setExportOk] = useState(null);
  const [taxS, setTaxS] = useState({ blue:true, spouse:false, ideco:23000, mutual:70000, home:30, medical:0, furu:0 });

  // クレカCSV
  const [ccCard, setCcCard] = useState("auto");
  const [ccData, setCcData] = useState(null);
  const [ccSelected, setCcSelected] = useState(new Set());
  const ccRef = useRef(null);
  const amzRef = useRef(null);

  const tgt = acct === "assistant" ? target : acct;
  const cur = data[tgt];
  const setExp = fn => setData(p=>({...p,[tgt]:{...p[tgt],expenses:typeof fn==="function"?fn(p[tgt].expenses):fn}}));
  const setInv = fn => setData(p=>({...p,[tgt]:{...p[tgt],inventory:typeof fn==="function"?fn(p[tgt].inventory):fn}}));
  const setBank = fn => setData(p=>({...p,[tgt]:{...p[tgt],bank:typeof fn==="function"?fn(p[tgt].bank):fn}}));
  const setBankBal = v => setData(p=>({...p,[tgt]:{...p[tgt],bankBalance:v}}));

  const mInc = cur.sales[2];
  const totInc = mInc.amazon+mInc.sns+mInc.support+mInc.other;
  const totExp = cur.expenses.reduce((s,e)=>s+e.amt,0);
  const profit = totInc-totExp;
  const profRate = totInc>0?((profit/totInc)*100).toFixed(1):0;
  const invVal = cur.inventory.reduce((s,i)=>s+i.cost*(i.fba+i.self),0);
  const lowStock = cur.inventory.filter(i=>(i.fba+i.self)<=i.rp);
  const ccExpenses = cur.expenses.filter(e=>e.origin==="creditcard");
  const manualExpenses = cur.expenses.filter(e=>e.origin==="manual");

  const expByAcct = useMemo(()=>{
    const m={};cur.expenses.forEach(e=>{const a=detect(e.desc);m[a]=(m[a]||0)+e.amt;});
    return Object.entries(m).map(([n,v])=>({name:n,value:v})).sort((a,b)=>b.value-a.value);
  },[cur.expenses]);

  // CSV出力
  const exportCSV = () => {
    const h = "日付,勘定科目,摘要,収入源,金額,領収書,備考,取込元\n";
    const rows = cur.expenses.map(e => {
      const s = SOURCES.find(x=>x.id===e.src);
      return `${e.date},${detect(e.desc)},"${e.desc}",${s?.name||""},${e.amt},${e.rcpt?"あり":"なし"},"${e.memo||""}",${e.origin==="creditcard"?"クレカ":e.origin==="amazon"?"Amazon":"手入力"}`;
    }).join("\n");
    const blob = new Blob(["\uFEFF"+h+rows],{type:"text/csv;charset=utf-8;"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=`帳簿_${tgt==="owner"?"事業主":"サポート"}_${new Date().toISOString().slice(0,7)}.csv`;
    a.click();URL.revokeObjectURL(a.href);
    setExportOk("csv");setTimeout(()=>setExportOk(null),3000);
  };

  // クレカCSV読み込み
  const handleCCUpload = e => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target.result;
      const lines = text.split("\n").filter(l=>l.trim());
      if(lines.length<2){setCcData({error:"データが見つかりません"});return;}
      const headers = lines[0].split(",").map(h=>h.replace(/"/g,"").trim());
      const rows = lines.slice(1).map(l=>{
        const vals=l.match(/(".*?"|[^,]+)/g)?.map(v=>v.replace(/"/g,"").trim())||[];
        const obj={};headers.forEach((h,i)=>{obj[h]=vals[i]||"";});return obj;
      }).filter(r=>Object.values(r).some(v=>v));

      // 自動検出 or マッピング適用
      let mapping = CC_MAPPINGS[ccCard];
      if(ccCard==="auto"){
        const dateKeys=["利用日","ご利用日","日付","DATE","date"];
        const descKeys=["利用店名・商品名","ご利用先など","利用先","ご利用先/概要","摘要","DESCRIPTION"];
        const amtKeys=["利用金額","ご利用金額","金額","AMOUNT","支払金額"];
        const dk=headers.find(h=>dateKeys.some(k=>h.includes(k)))||headers[0];
        const dsk=headers.find(h=>descKeys.some(k=>h.includes(k)))||headers[1];
        const ak=headers.find(h=>amtKeys.some(k=>h.includes(k)))||headers.find(h=>/金額|amount/i.test(h))||headers[2];
        mapping={name:"自動検出",date:dk,desc:dsk,amount:ak};
      }

      const parsed = rows.map((r,i)=>({
        idx: i,
        date: r[mapping.date]||"",
        desc: r[mapping.desc]||"",
        amount: Math.abs(parseInt(String(r[mapping.amount]||"0").replace(/[,¥\\s]/g,"")))||0,
        account: detect(r[mapping.desc]||""),
        raw: r,
      })).filter(r=>r.amount>0);

      setCcData({headers,rows:parsed,fileName:file.name,mapping});
      setCcSelected(new Set(parsed.map(r=>r.idx)));
    };
    reader.readAsText(file,"UTF-8");
    e.target.value="";
  };

  // Amazon CSV
  const handleAmzUpload = e => {
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const text=ev.target.result;
      const lines=text.split("\n").filter(l=>l.trim());
      if(lines.length<2)return;
      const headers=lines[0].split(",").map(h=>h.replace(/"/g,"").trim());
      const rows=lines.slice(1).map(l=>{
        const vals=l.match(/(".*?"|[^,]+)/g)?.map(v=>v.replace(/"/g,"").trim())||[];
        const obj={};headers.forEach((h,i)=>{obj[h]=vals[i]||"";});return obj;
      });
      const newExps=rows.slice(0,100).map((r,i)=>{
        const desc=r.type||r.description||r["transaction type"]||r["商品名"]||`Amazon取引${i+1}`;
        const amt=Math.abs(parseFloat(r.total||r.amount||r["合計"]||r["金額"]||"0"))||0;
        const date=(r["date/time"]||r["日付"]||r["posted-date"]||"").slice(0,10)||new Date().toISOString().slice(0,10);
        return{id:`${tgt}-amz-${Date.now()}-${i}`,date:date.replace(/\//g,"-"),desc:String(desc).slice(0,60),amt:Math.round(amt),src:"amazon",rcpt:true,memo:"Amazon CSV取込",origin:"amazon"};
      }).filter(e=>e.amt>0);
      if(newExps.length>0){setExp(p=>[...p,...newExps]);}
      setModal(null);
    };
    reader.readAsText(file,"UTF-8");
    e.target.value="";
  };

  const importCCSelected = () => {
    if(!ccData?.rows) return;
    const selected = ccData.rows.filter(r=>ccSelected.has(r.idx));
    const newExps = selected.map((r,i) => ({
      id: `${tgt}-cc-${Date.now()}-${i}`,
      date: r.date.replace(/\//g,"-").replace(/(\d{4})(\d{2})(\d{2})/,"$1-$2-$3"),
      desc: r.desc,
      amt: r.amount,
      src: "amazon",
      rcpt: true,
      memo: "クレカCSV取込",
      origin: "creditcard",
    }));
    setExp(p=>[...p,...newExps]);
    setCcData(null);setCcSelected(new Set());
  };

  // ===== スタイル =====
  const S = {
    lbl:{fontSize:12,fontWeight:600,color:"#555",display:"block",marginBottom:4},
    inp:{width:"100%",padding:"8px 11px",borderRadius:8,border:"1px solid #dfe3ea",fontSize:13,outline:"none",boxSizing:"border-box",background:"#fafbfd"},
    td:{padding:"10px 9px"},
    crd:{background:"#fff",borderRadius:13,padding:18,boxShadow:"0 1px 3px rgba(0,0,0,0.03)",border:"1px solid #edf0f5"},
    btn1:{padding:"8px 16px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#fff",background:"linear-gradient(135deg,#FF9900,#FF6600)",boxShadow:"0 2px 8px rgba(255,153,0,0.2)"},
    btn2:{padding:"8px 16px",borderRadius:8,border:"1px solid #dde1e8",background:"#fff",fontSize:13,cursor:"pointer",color:"#555",fontWeight:600},
    ibtn:{background:"none",border:"1px solid #e6eaf0",borderRadius:6,padding:"4px 6px",cursor:"pointer",color:"#8892a4"},
    sec:{margin:"0 0 14px",fontSize:15,fontWeight:700,color:"#1a1a2e"},
  };

  const Card = ({title,value,icon,color,sub,trend,tv}) => (
    <div style={{...S.crd,flex:1,minWidth:160,padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
        <div style={{width:36,height:36,borderRadius:9,background:`${color}12`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{icon}</div>
        {trend&&<span style={{display:"flex",alignItems:"center",gap:2,fontSize:11,fontWeight:600,color:trend==="up"?"#22C55E":"#EF4444",background:trend==="up"?"#22C55E10":"#EF444410",padding:"2px 7px",borderRadius:12}}>{trend==="up"?<ArrowUpRight size={11}/>:<ArrowDownRight size={11}/>}{tv}</span>}
      </div>
      <p style={{color:"#8892a4",fontSize:11,margin:"0 0 2px",fontWeight:500}}>{title}</p>
      <p style={{color:"#1a1a2e",fontSize:20,fontWeight:800,margin:"0 0 1px",letterSpacing:"-0.5px"}}>{value}</p>
      {sub&&<p style={{color:"#b0b8c8",fontSize:10,margin:0}}>{sub}</p>}
    </div>
  );

  // ===== Header =====
  const Header = () => (
    <div style={{background:"linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)",padding:"12px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:36,height:36,borderRadius:9,background:"linear-gradient(135deg,#FF9900,#FF6600)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fff"}}>B</div>
        <div><h1 style={{color:"#fff",fontSize:16,fontWeight:800,margin:0}}>BizBoard Pro</h1><p style={{color:"rgba(255,255,255,0.3)",fontSize:10,margin:0}}>v4.0 — クレカ取込対応 × 青色申告</p></div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
        <div style={{display:"flex",background:"rgba(255,255,255,0.06)",borderRadius:7,padding:2}}>
          {[{id:"owner",e:"👑",n:"事業主"},{id:"assistant",e:"🛠️",n:"サポート"}].map(a=>(
            <button key={a.id} onClick={()=>setAcct(a.id)} style={{padding:"5px 11px",borderRadius:5,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:acct===a.id?"rgba(255,153,0,0.85)":"transparent",color:acct===a.id?"#fff":"rgba(255,255,255,0.3)"}}>{a.e} {a.n}</button>
          ))}
        </div>
        {acct==="assistant"&&<div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(74,144,217,0.12)",borderRadius:7,padding:"3px 9px",border:"1px solid rgba(74,144,217,0.2)"}}>
          <span style={{color:"#8BB8E8",fontSize:10,fontWeight:600}}>管理中:</span>
          <select value={target} onChange={e=>setTarget(e.target.value)} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",borderRadius:4,padding:"2px 5px",fontSize:11,fontWeight:700,cursor:"pointer"}}><option value="owner" style={{color:"#333"}}>👑 事業主</option><option value="assistant" style={{color:"#333"}}>🛠️ 自分</option></select>
        </div>}
      </div>
    </div>
  );

  // ===== Nav =====
  const Nav = () => (
    <div style={{display:"flex",gap:2,padding:"8px 22px",background:"#f7f8fb",borderBottom:"1px solid #e6eaf0",flexWrap:"wrap"}}>
      {[
        {id:"dashboard",n:"ダッシュボード",I:TrendingUp},
        {id:"book",n:"帳簿・経費",I:BookOpen},
        {id:"import",n:"クレカ・CSV取込",I:CreditCard},
        {id:"bank",n:"口座・資金",I:Building},
        {id:"inv",n:"在庫管理",I:Package},
        {id:"tax",n:"節税",I:Calculator},
      ].map(t=>{
        const active=tab===t.id;
        return <button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 13px",borderRadius:7,border:"none",cursor:"pointer",fontSize:12,fontWeight:active?700:500,background:active?"#fff":"transparent",color:active?"#1a1a2e":"#8892a4",boxShadow:active?"0 1px 4px rgba(0,0,0,0.04)":"none"}}><t.I size={14}/>{t.n}</button>;
      })}
    </div>
  );

  // ===== Dashboard =====
  const Dashboard = () => {
    const ann=cur.sales.map(d=>({...d,total:d.amazon+d.sns+d.support+d.other}));
    const bySrc=SOURCES.map(s=>({name:s.name,value:mInc[s.id]||0,color:s.color}));
    const originData=[
      {name:"クレカCSV取込",value:ccExpenses.reduce((s,e)=>s+e.amt,0),color:"#5856D6"},
      {name:"Amazon CSV取込",value:cur.expenses.filter(e=>e.origin==="amazon").reduce((s,e)=>s+e.amt,0),color:"#FF9900"},
      {name:"手入力",value:manualExpenses.reduce((s,e)=>s+e.amt,0),color:"#8892a4"},
    ].filter(d=>d.value>0);

    return (
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {acct==="assistant"&&<div style={{background:"linear-gradient(135deg,#EBF5FF,#E0EDFF)",borderRadius:9,padding:"10px 16px",border:"1px solid #B3D4FC",display:"flex",alignItems:"center",gap:8,fontSize:12}}><Users size={15} color="#2563EB"/><span style={{color:"#1E40AF",fontWeight:600}}>現在 <strong>{target==="owner"?"👑 事業主":"🛠️ 自分"}</strong> のデータを管理中</span></div>}

        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <Card title="今月の売上" value={fmt(totInc)} icon="💰" color="#FF9900" trend="up" tv="+12.3%"/>
          <Card title="今月の経費" value={fmt(totExp)} icon="📊" color="#EF4444" trend="down" tv="-5.2%"/>
          <Card title="粗利益" value={fmt(profit)} icon="✨" color="#22C55E" sub={`利益率 ${profRate}%`}/>
          <Card title="口座残高" value={fmt(cur.bankBalance)} icon="🏦" color="#5856D6" sub="事業用口座"/>
          <Card title="在庫資産" value={fmt(invVal)} icon="📦" color="#4A90D9" sub={lowStock.length?`⚠️ ${lowStock.length}件要発注`:"正常"}/>
        </div>

        {/* クレカ vs 手入力の内訳 */}
        <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
          <div style={{...S.crd,flex:2,minWidth:340}}>
            <h3 style={S.sec}>📈 年間売上推移</h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={ann}>
                <defs>{SOURCES.map(s=><linearGradient key={s.id} id={`g4-${s.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={s.color} stopOpacity={0.2}/><stop offset="95%" stopColor={s.color} stopOpacity={0}/></linearGradient>)}</defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="month" tick={{fontSize:10,fill:"#8892a4"}}/>
                <YAxis tick={{fontSize:10,fill:"#8892a4"}} tickFormatter={v=>`${(v/10000).toFixed(0)}万`}/>
                <Tooltip formatter={v=>fmt(v)} contentStyle={{borderRadius:8,border:"1px solid #eee",fontSize:12}}/>
                <Legend wrapperStyle={{fontSize:11}}/>
                {SOURCES.map(s=><Area key={s.id} type="monotone" dataKey={s.id} name={s.name} stroke={s.color} fill={`url(#g4-${s.id})`} strokeWidth={2}/>)}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{flex:1,minWidth:230,display:"flex",flexDirection:"column",gap:14}}>
            <div style={S.crd}>
              <h3 style={{...S.sec,fontSize:13}}>💳 経費の取込元内訳</h3>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart><Pie data={originData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value">{originData.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie><Tooltip formatter={v=>fmt(v)}/></PieChart>
              </ResponsiveContainer>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {originData.map((d,i)=><div key={i} style={{display:"flex",justifyContent:"space-between"}}><div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:2,background:d.color}}/><span style={{fontSize:10,color:"#666"}}>{d.name}</span></div><span style={{fontSize:10,fontWeight:700}}>{fmt(d.value)}</span></div>)}
              </div>
            </div>
            <div style={S.crd}>
              <h3 style={{...S.sec,fontSize:13}}>📊 収入源内訳</h3>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {bySrc.map((s,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:2,background:s.color}}/><span style={{fontSize:11,color:"#666"}}>{s.name}</span></div><span style={{fontSize:11,fontWeight:700}}>{fmt(s.value)}</span></div>)}
              </div>
            </div>
          </div>
        </div>

        <div style={S.crd}>
          <h3 style={S.sec}>💸 勘定科目別 経費（自動分類）</h3>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={expByAcct} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/><XAxis type="number" tick={{fontSize:10,fill:"#8892a4"}} tickFormatter={v=>`${(v/1000)}K`}/><YAxis type="category" dataKey="name" width={85} tick={{fontSize:11,fill:"#555"}}/><Tooltip formatter={v=>fmt(v)}/><Bar dataKey="value" name="金額" radius={[0,5,5,0]}>{expByAcct.map((_,i)=><Cell key={i} fill={C8[i%C8.length]}/>)}</Bar></BarChart>
          </ResponsiveContainer>
        </div>

        {lowStock.length>0&&<div style={{background:"#FFF8E1",borderRadius:9,padding:12,border:"1px solid #FFE082",display:"flex",gap:10}}><AlertTriangle size={16} color="#F9A825" style={{flexShrink:0,marginTop:2}}/><div><p style={{fontWeight:700,color:"#E65100",margin:"0 0 5px",fontSize:12}}>在庫アラート：{lowStock.length}件</p><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{lowStock.map(i=><span key={i.id} style={{background:"#fff",padding:"3px 8px",borderRadius:5,fontSize:10,color:"#BF360C",border:"1px solid #FFCC80",fontWeight:600}}>{i.name}（残{i.fba+i.self}）</span>)}</div></div></div>}
      </div>
    );
  };

  // ===== クレカ・CSV取込タブ =====
  const ImportTab = () => (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:"linear-gradient(135deg,#5856D615,#4A90D910)",borderRadius:12,padding:20,border:"1px solid #C7D2FE"}}>
        <h3 style={{margin:"0 0 6px",fontSize:17,fontWeight:800,color:"#312E81"}}>💳 クレカ明細CSV取込</h3>
        <p style={{margin:0,color:"#4338CA",fontSize:13}}>マネーフォワードの銀行連携と同等の自動経費登録を、CSVアップロードだけで実現します</p>
      </div>

      {/* マネフォとの比較 */}
      <div style={S.crd}>
        <h4 style={{margin:"0 0 12px",fontSize:14,fontWeight:700}}>🔄 マネーフォワードの銀行連携 vs BizBoard Proのクレカ取込</h4>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{background:"#f7f8fb",borderRadius:10,padding:14,border:"1px solid #e6eaf0"}}>
            <p style={{margin:"0 0 8px",fontWeight:700,fontSize:13,color:"#666"}}>マネーフォワード</p>
            <div style={{fontSize:12,color:"#888",lineHeight:1.8}}>
              <p style={{margin:0}}>✅ 自動で明細取得（API連携）</p>
              <p style={{margin:0}}>❌ 勘定科目は手動で仕訳が必要</p>
              <p style={{margin:0}}>❌ 物販特有の経費区分がない</p>
              <p style={{margin:0}}>❌ 月額980〜2,980円が必要</p>
              <p style={{margin:0}}>❌ 連携切れが頻繁に発生</p>
            </div>
          </div>
          <div style={{background:"linear-gradient(135deg,#ECFDF5,#F0FDF4)",borderRadius:10,padding:14,border:"1px solid #BBF7D0"}}>
            <p style={{margin:"0 0 8px",fontWeight:700,fontSize:13,color:"#166534"}}>BizBoard Pro</p>
            <div style={{fontSize:12,color:"#166534",lineHeight:1.8}}>
              <p style={{margin:0}}>✅ 月1回CSVアップロードするだけ</p>
              <p style={{margin:0}}>✅ 勘定科目を自動判定（物販特化）</p>
              <p style={{margin:0}}>✅ FBA手数料・保管料も自動分類</p>
              <p style={{margin:0}}>✅ 完全無料</p>
              <p style={{margin:0}}>✅ 連携切れの心配なし</p>
            </div>
          </div>
        </div>
      </div>

      {/* ステップガイド */}
      <div style={S.crd}>
        <h4 style={{margin:"0 0 14px",fontSize:14,fontWeight:700}}>📋 クレカ明細CSV ダウンロード手順</h4>
        {[
          {step:"STEP 1",title:"カード会社のWebサイトにログイン",desc:"楽天e-NAVI / Vpass / MyJCB / アメックスオンラインなど"},
          {step:"STEP 2",title:"利用明細をCSVでダウンロード",desc:"「利用明細」→「CSV出力」or「ダウンロード」。月単位で取得してください"},
          {step:"STEP 3",title:"下のエリアでカード会社を選んでアップロード",desc:"自動検出モードなら、どのカード会社のCSVでも読み込めます"},
        ].map((s,i)=>(
          <div key={i} style={{display:"flex",gap:12,marginBottom:14}}>
            <div style={{background:"linear-gradient(135deg,#5856D6,#4338CA)",color:"#fff",borderRadius:7,padding:"5px 10px",fontSize:10,fontWeight:800,whiteSpace:"nowrap",height:"fit-content"}}>{s.step}</div>
            <div><p style={{margin:"0 0 2px",fontWeight:700,fontSize:13}}>{s.title}</p><p style={{margin:0,fontSize:12,color:"#666"}}>{s.desc}</p></div>
          </div>
        ))}
      </div>

      {/* アップロード */}
      <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
        <div style={{...S.crd,flex:1,minWidth:300,border:"2px dashed #5856D6",textAlign:"center",padding:24}}>
          <CreditCard size={32} color="#5856D6" style={{marginBottom:10}}/>
          <p style={{fontWeight:700,fontSize:14,color:"#1a1a2e",margin:"0 0 8px"}}>💳 クレカ明細CSV</p>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:600,color:"#555"}}>カード会社：</label>
            <select value={ccCard} onChange={e=>setCcCard(e.target.value)} style={{...S.inp,width:"auto",display:"inline-block",marginLeft:8}}>
              <option value="auto">自動検出</option>
              <option value="rakuten">楽天カード</option>
              <option value="smbc">三井住友カード</option>
              <option value="jcb">JCB</option>
              <option value="amex">アメックス</option>
            </select>
          </div>
          <input type="file" accept=".csv,.tsv,.txt" ref={ccRef} onChange={handleCCUpload} style={{display:"none"}}/>
          <button onClick={()=>ccRef.current?.click()} style={{...S.btn1,background:"linear-gradient(135deg,#5856D6,#4338CA)",padding:"10px 28px"}}>📂 クレカCSVを選択</button>
        </div>

        <div style={{...S.crd,flex:1,minWidth:300,border:"2px dashed #FF9900",textAlign:"center",padding:24}}>
          <Package size={32} color="#FF9900" style={{marginBottom:10}}/>
          <p style={{fontWeight:700,fontSize:14,color:"#1a1a2e",margin:"0 0 8px"}}>📦 AmazonペイメントCSV</p>
          <p style={{fontSize:12,color:"#666",margin:"0 0 14px"}}>セラーセントラル → レポート → ペイメント</p>
          <input type="file" accept=".csv,.tsv,.txt" ref={amzRef} onChange={handleAmzUpload} style={{display:"none"}}/>
          <button onClick={()=>amzRef.current?.click()} style={{...S.btn1,padding:"10px 28px"}}>📂 Amazon CSVを選択</button>
        </div>
      </div>

      {/* クレカCSV結果 */}
      {ccData&&!ccData.error&&(
        <div style={S.crd}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <div>
              <h4 style={{margin:"0 0 3px",fontSize:14,fontWeight:700}}>💳 {ccData.fileName}（{ccData.rows.length}件検出）</h4>
              <p style={{margin:0,fontSize:11,color:"#666"}}>取込みたい明細にチェック → 「帳簿に取込」をクリック</p>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{ccSelected.size===ccData.rows.length?setCcSelected(new Set()):setCcSelected(new Set(ccData.rows.map(r=>r.idx)));}} style={S.btn2}>{ccSelected.size===ccData.rows.length?"全解除":"全選択"}</button>
              <button onClick={importCCSelected} style={{...S.btn1,background:"linear-gradient(135deg,#5856D6,#4338CA)"}} disabled={ccSelected.size===0}>📥 {ccSelected.size}件を帳簿に取込</button>
              <button onClick={()=>{setCcData(null);setCcSelected(new Set());}} style={S.btn2}>クリア</button>
            </div>
          </div>
          <div style={{overflowX:"auto",maxHeight:400}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#f7f8fb"}}>{["✓","日付","利用先","金額","自動判定科目"].map(h=><th key={h} style={{padding:"9px 10px",textAlign:"left",fontWeight:700,color:"#666",fontSize:10}}>{h}</th>)}</tr></thead>
              <tbody>{ccData.rows.map(r=>(
                <tr key={r.idx} style={{borderBottom:"1px solid #f0f2f5",background:ccSelected.has(r.idx)?"#F5F3FF":"transparent"}}>
                  <td style={S.td}><input type="checkbox" checked={ccSelected.has(r.idx)} onChange={()=>{const n=new Set(ccSelected);n.has(r.idx)?n.delete(r.idx):n.add(r.idx);setCcSelected(n);}} style={{accentColor:"#5856D6"}}/></td>
                  <td style={S.td}>{r.date}</td>
                  <td style={{...S.td,fontWeight:500,maxWidth:250,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.desc}</td>
                  <td style={{...S.td,fontWeight:700,fontFamily:"monospace"}}>{fmt(r.amount)}</td>
                  <td style={S.td}><span style={{background:"#5856D612",padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,color:"#5856D6"}}>{r.account}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{background:"#ECFDF5",borderRadius:9,padding:14,border:"1px solid #BBF7D0",fontSize:12,color:"#166534",lineHeight:1.8}}>
        <strong>💡 マネーフォワードから乗り換えるメリット：</strong><br/>
        月1回のCSVアップロード（約2分）だけで、マネーフォワードの銀行連携と同等の経費自動登録が実現します。しかも勘定科目はAmazon物販に特化した自動判定付き。月額料金も不要なので、年間で12,000〜36,000円の節約になります。
      </div>
    </div>
  );

  // ===== 口座・資金タブ =====
  const BankTab = () => {
    const [newTx, setNewTx] = useState({date:new Date().toISOString().slice(0,10),name:"",amount:"",type:"expense"});
    const [showBankForm, setShowBankForm] = useState(false);
    const [editBal, setEditBal] = useState(false);
    const [newBal, setNewBal] = useState(String(cur.bankBalance));

    const saveTx = () => {
      if(!newTx.name||!newTx.amount)return;
      const amt = Number(newTx.amount) * (newTx.type==="expense"?-1:1);
      setBank(p=>[...p,{id:`${tgt}-b${Date.now()}`,date:newTx.date,name:newTx.name,amount:amt,type:newTx.type}]);
      setBankBal(cur.bankBalance+amt);
      setNewTx({date:new Date().toISOString().slice(0,10),name:"",amount:"",type:"expense"});
      setShowBankForm(false);
    };

    const bankFlow = cur.bank.reduce((acc,tx)=>{
      const m = tx.date.slice(5,7)+"月";
      if(!acc[m]) acc[m]={month:m,income:0,expense:0};
      if(tx.amount>0) acc[m].income+=tx.amount; else acc[m].expense+=Math.abs(tx.amount);
      return acc;
    },{});

    return (
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <div style={{background:"linear-gradient(135deg,#312E8110,#5856D608)",borderRadius:12,padding:20,border:"1px solid #C7D2FE"}}>
          <h3 style={{margin:"0 0 6px",fontSize:17,fontWeight:800,color:"#312E81"}}>🏦 口座・資金管理</h3>
          <p style={{margin:0,color:"#4338CA",fontSize:13}}>事業用口座の残高と入出金を管理します</p>
        </div>

        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          <div style={{...S.crd,flex:1,minWidth:200,background:"linear-gradient(135deg,#EEF2FF,#E0E7FF)",borderColor:"#C7D2FE"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <p style={{fontSize:11,color:"#4338CA",margin:"0 0 3px",fontWeight:600}}>事業用口座残高</p>
                {editBal?<div style={{display:"flex",gap:6,alignItems:"center"}}><input type="number" value={newBal} onChange={e=>setNewBal(e.target.value)} style={{...S.inp,width:160,fontSize:16,fontWeight:700}}/><button onClick={()=>{setBankBal(Number(newBal));setEditBal(false);}} style={{...S.btn1,padding:"6px 12px",fontSize:11}}>保存</button></div>
                :<p style={{fontSize:28,fontWeight:900,color:"#1E1B4B",margin:0}}>{fmt(cur.bankBalance)}</p>}
              </div>
              {!editBal&&<button onClick={()=>{setNewBal(String(cur.bankBalance));setEditBal(true);}} style={{...S.ibtn,fontSize:10,padding:"4px 8px"}}><Edit3 size={12}/> 残高修正</button>}
            </div>
          </div>
          <Card title="今月の入金" value={fmt(cur.bank.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0))} icon="📥" color="#22C55E"/>
          <Card title="今月の出金" value={fmt(Math.abs(cur.bank.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0)))} icon="📤" color="#EF4444"/>
        </div>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h4 style={{margin:0,fontSize:14,fontWeight:700}}>📋 入出金明細</h4>
          <button onClick={()=>setShowBankForm(!showBankForm)} style={{...S.btn1,background:"linear-gradient(135deg,#5856D6,#4338CA)",display:"flex",alignItems:"center",gap:5,fontSize:12}}><Plus size={14}/> 入出金を追加</button>
        </div>

        {showBankForm&&(
          <div style={{...S.crd,border:"2px solid #5856D6"}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
              <div><label style={S.lbl}>日付</label><input type="date" value={newTx.date} onChange={e=>setNewTx({...newTx,date:e.target.value})} style={S.inp}/></div>
              <div><label style={S.lbl}>種類</label><select value={newTx.type} onChange={e=>setNewTx({...newTx,type:e.target.value})} style={S.inp}><option value="income">入金</option><option value="expense">出金</option></select></div>
              <div style={{gridColumn:"span 2"}}><label style={S.lbl}>内容</label><input type="text" placeholder="例：Amazon入金、クレカ引落、仕入代金" value={newTx.name} onChange={e=>setNewTx({...newTx,name:e.target.value})} style={S.inp}/></div>
              <div><label style={S.lbl}>金額（円）</label><input type="number" placeholder="0" value={newTx.amount} onChange={e=>setNewTx({...newTx,amount:e.target.value})} style={S.inp}/></div>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:12}}>
              <button onClick={()=>setShowBankForm(false)} style={S.btn2}>キャンセル</button>
              <button onClick={saveTx} style={{...S.btn1,background:"linear-gradient(135deg,#5856D6,#4338CA)"}}>登録</button>
            </div>
          </div>
        )}

        <div style={{...S.crd,padding:0,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#f7f8fb"}}>{["日付","内容","入金","出金","操作"].map(h=><th key={h} style={{padding:"10px 12px",textAlign:"left",fontWeight:700,color:"#666",fontSize:10}}>{h}</th>)}</tr></thead>
              <tbody>{[...cur.bank].sort((a,b)=>b.date.localeCompare(a.date)).map(tx=>(
                <tr key={tx.id} style={{borderBottom:"1px solid #f0f2f5"}} onMouseEnter={e=>e.currentTarget.style.background="#fafbfd"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={S.td}>{tx.date}</td>
                  <td style={{...S.td,fontWeight:500}}>{tx.name}</td>
                  <td style={{...S.td,fontWeight:700,color:"#22C55E",fontFamily:"monospace"}}>{tx.amount>0?fmt(tx.amount):""}</td>
                  <td style={{...S.td,fontWeight:700,color:"#EF4444",fontFamily:"monospace"}}>{tx.amount<0?fmt(Math.abs(tx.amount)):""}</td>
                  <td style={S.td}><button onClick={()=>{setBankBal(cur.bankBalance-tx.amount);setBank(p=>p.filter(t=>t.id!==tx.id));}} style={{...S.ibtn,color:"#EF4444"}}><Trash2 size={12}/></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>

        <div style={{background:"#FFFBEB",borderRadius:9,padding:12,border:"1px solid #FDE68A",fontSize:12,color:"#92400E",lineHeight:1.7}}>
          <strong>💡 口座残高の管理について：</strong><br/>
          マネーフォワードのようなAPI自動連携ではありませんが、月1回の残高チェックと主要な入出金の記録で十分に資金管理ができます。クレカの引落日・Amazon入金日を記録しておくと、キャッシュフローの把握に役立ちます。
        </div>
      </div>
    );
  };

  // ===== 帳簿タブ（簡略化） =====
  const BookTab = () => {
    const [nw, setNw] = useState({date:new Date().toISOString().slice(0,10),desc:"",amt:"",src:"amazon",rcpt:false,memo:""});
    const det=nw.desc?detect(nw.desc):null;
    const flt=cur.expenses.filter(e=>e.desc.toLowerCase().includes(search.toLowerCase()));
    const save=()=>{
      if(!nw.desc||!nw.amt)return;
      if(editing){setExp(p=>p.map(e=>e.id===editing.id?{...nw,id:e.id,amt:Number(nw.amt),origin:e.origin}:e));setEditing(null);}
      else{setExp(p=>[...p,{...nw,id:`${tgt}-${Date.now()}`,amt:Number(nw.amt),origin:"manual"}]);}
      setNw({date:new Date().toISOString().slice(0,10),desc:"",amt:"",src:"amazon",rcpt:false,memo:""});setShowForm(false);
    };
    return (
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",gap:8,flex:1,minWidth:250}}>
            <div style={{display:"flex",alignItems:"center",gap:5,background:"#fff",borderRadius:7,padding:"6px 11px",border:"1px solid #e6eaf0",flex:1}}>
              <Search size={13} color="#8892a4"/><input type="text" placeholder="検索..." value={search} onChange={e=>setSearch(e.target.value)} style={{border:"none",outline:"none",fontSize:12,width:"100%",background:"transparent"}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={exportCSV} style={{...S.btn2,display:"flex",alignItems:"center",gap:4,fontSize:11}}><Download size={13}/> CSV出力</button>
            <button onClick={()=>{setEditing(null);setShowForm(true);}} style={{...S.btn1,display:"flex",alignItems:"center",gap:4,fontSize:12}}><Plus size={13}/> 経費追加</button>
          </div>
        </div>

        <div><p style={{fontSize:10,color:"#8892a4",margin:"0 0 5px",fontWeight:600}}>⚡ ワンタップ入力</p><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{TEMPLATES.map((t,i)=><button key={i} onClick={()=>{setNw(p=>({...p,desc:t.desc,src:t.src}));setShowForm(true);}} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #e6eaf0",background:"#fff",cursor:"pointer",fontSize:11,fontWeight:600,color:"#555"}}>{t.label}</button>)}</div></div>

        {showForm&&<div style={{...S.crd,border:"2px solid #FF9900"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><h3 style={{margin:0,fontSize:13,fontWeight:700}}>{editing?"✏️ 編集":"➕ 新規経費"}</h3><button onClick={()=>{setShowForm(false);setEditing(null);}} style={{background:"none",border:"none",cursor:"pointer"}}><X size={15}/></button></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
            <div><label style={S.lbl}>日付</label><input type="date" value={nw.date} onChange={e=>setNw({...nw,date:e.target.value})} style={S.inp}/></div>
            <div style={{gridColumn:"span 2"}}><label style={S.lbl}>何に使った？</label><input type="text" placeholder="例：商品仕入れ、FBA送料..." value={nw.desc} onChange={e=>setNw({...nw,desc:e.target.value})} style={S.inp}/>{det&&nw.desc&&<div style={{marginTop:4,fontSize:11,color:"#22C55E",fontWeight:600,display:"flex",alignItems:"center",gap:4}}><Zap size={11}/>自動判定 → <span style={{background:"#22C55E12",padding:"1px 7px",borderRadius:4,color:"#16A34A",fontWeight:700}}>{det}</span></div>}</div>
            <div><label style={S.lbl}>金額</label><input type="number" placeholder="0" value={nw.amt} onChange={e=>setNw({...nw,amt:e.target.value})} style={S.inp}/></div>
            <div><label style={S.lbl}>事業</label><select value={nw.src} onChange={e=>setNw({...nw,src:e.target.value})} style={S.inp}>{SOURCES.map(s=><option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}</select></div>
            <div><label style={S.lbl}>備考</label><input type="text" placeholder="家事按分50%など" value={nw.memo} onChange={e=>setNw({...nw,memo:e.target.value})} style={S.inp}/></div>
            <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}><label style={{fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}><input type="checkbox" checked={nw.rcpt} onChange={e=>setNw({...nw,rcpt:e.target.checked})} style={{accentColor:"#FF9900"}}/>領収書あり</label></div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginTop:12}}><button onClick={()=>{setShowForm(false);setEditing(null);}} style={S.btn2}>キャンセル</button><button onClick={save} style={S.btn1}>{editing?"更新":"登録"}</button></div>
        </div>}

        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {[{t:"経費合計",v:fmt(totExp),c:"#9A3412",bg:"linear-gradient(135deg,#FFF7ED,#FFF1E0)",bc:"#FED7AA"},{t:"件数",v:`${cur.expenses.length}件`,c:"#1a1a2e"},{t:"クレカ取込",v:`${ccExpenses.length}件`,c:"#5856D6"},{t:"領収書未",v:`${cur.expenses.filter(e=>!e.rcpt).length}件`,c:"#EF4444"}].map((d,i)=><div key={i} style={{...S.crd,flex:1,minWidth:130,...(d.bg?{background:d.bg,borderColor:d.bc}:{})}}><p style={{fontSize:10,color:d.c==="#1a1a2e"?"#8892a4":d.c,margin:"0 0 1px",fontWeight:600}}>{d.t}</p><p style={{fontSize:18,fontWeight:800,color:d.c,margin:0}}>{d.v}</p></div>)}
        </div>

        <div style={{...S.crd,padding:0,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#f7f8fb"}}>{["日付","科目","内容","事業","金額","取込元","領収書","操作"].map(h=><th key={h} style={{padding:"9px 8px",textAlign:"left",fontWeight:700,color:"#666",fontSize:10}}>{h}</th>)}</tr></thead>
              <tbody>{flt.map(e=>{const a=detect(e.desc);const s=SOURCES.find(x=>x.id===e.src);return(
                <tr key={e.id} style={{borderBottom:"1px solid #f0f2f5"}} onMouseEnter={ev=>ev.currentTarget.style.background="#fafbfd"} onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
                  <td style={S.td}>{e.date}</td>
                  <td style={S.td}><span style={{background:"#f0f2f7",padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:600}}>{a}</span></td>
                  <td style={{...S.td,fontWeight:500,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.desc}</td>
                  <td style={S.td}><span style={{color:s?.color,fontWeight:600,fontSize:10}}>{s?.icon}</span></td>
                  <td style={{...S.td,fontWeight:700,fontFamily:"monospace",fontSize:13}}>{fmt(e.amt)}</td>
                  <td style={S.td}><span style={{fontSize:10,fontWeight:600,color:e.origin==="creditcard"?"#5856D6":e.origin==="amazon"?"#FF9900":"#8892a4",background:e.origin==="creditcard"?"#5856D610":e.origin==="amazon"?"#FF990010":"#f0f2f5",padding:"2px 6px",borderRadius:4}}>{e.origin==="creditcard"?"💳クレカ":e.origin==="amazon"?"📦Amazon":"✏️手入力"}</span></td>
                  <td style={S.td}>{e.rcpt?<CheckCircle size={14} color="#22C55E"/>:<AlertTriangle size={14} color="#F59E0B"/>}</td>
                  <td style={S.td}><div style={{display:"flex",gap:3}}>
                    <button onClick={()=>{setEditing(e);setNw({date:e.date,desc:e.desc,amt:String(e.amt),src:e.src,rcpt:e.rcpt,memo:e.memo||""});setShowForm(true);}} style={S.ibtn}><Edit3 size={12}/></button>
                    <button onClick={()=>setExp(p=>p.filter(x=>x.id!==e.id))} style={{...S.ibtn,color:"#EF4444"}}><Trash2 size={12}/></button>
                  </div></td>
                </tr>)})}</tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ===== 在庫タブ =====
  const InvTab = () => {
    const [ni,setNi]=useState({sku:"",name:"",cost:"",price:"",fba:"",self:"",rp:""});
    const sv=()=>{if(!ni.sku||!ni.name)return;const item={...ni,id:editInv?.id||`${tgt}-i${Date.now()}`,cost:Number(ni.cost),price:Number(ni.price),fba:Number(ni.fba),self:Number(ni.self),rp:Number(ni.rp)};if(editInv){setInv(p=>p.map(i=>i.id===editInv.id?item:i));setEditInv(null);}else{setInv(p=>[...p,item]);}setNi({sku:"",name:"",cost:"",price:"",fba:"",self:"",rp:""});setShowInvForm(false);};
    const mg=i=>i.price>0?((i.price-i.cost)/i.price*100).toFixed(1):"0";
    return(
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",justifyContent:"space-between"}}><h3 style={{margin:0,fontSize:15,fontWeight:700}}>📦 在庫一覧</h3><button onClick={()=>{setEditInv(null);setShowInvForm(true);}} style={{...S.btn1,background:"linear-gradient(135deg,#4A90D9,#357ABD)",fontSize:12}}><Plus size={13} style={{marginRight:3,verticalAlign:"middle"}}/>商品追加</button></div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Card title="SKU数" value={cur.inventory.length} icon="📋" color="#4A90D9"/><Card title="総在庫" value={cur.inventory.reduce((s,i)=>s+i.fba+i.self,0)} icon="📦" color="#FF9900"/><Card title="在庫資産" value={fmt(invVal)} icon="💰" color="#22C55E"/><Card title="要発注" value={lowStock.length} icon="⚠️" color="#EF4444"/></div>
        {showInvForm&&<div style={{...S.crd,border:"2px solid #4A90D9"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><h3 style={{margin:0,fontSize:13,fontWeight:700}}>{editInv?"✏️ 編集":"➕ 新規"}</h3><button onClick={()=>{setShowInvForm(false);setEditInv(null);}} style={{background:"none",border:"none",cursor:"pointer"}}><X size={15}/></button></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8}}>{[{k:"sku",l:"SKU",p:"AMZ-006"},{k:"name",l:"商品名",p:""},{k:"cost",l:"原価",p:"0",t:"number"},{k:"price",l:"販売価格",p:"0",t:"number"},{k:"fba",l:"FBA在庫",p:"0",t:"number"},{k:"self",l:"自社在庫",p:"0",t:"number"},{k:"rp",l:"発注点",p:"0",t:"number"}].map(f=><div key={f.k}><label style={S.lbl}>{f.l}</label><input type={f.t||"text"} placeholder={f.p} value={ni[f.k]} onChange={e=>setNi({...ni,[f.k]:e.target.value})} style={S.inp}/></div>)}</div><div style={{display:"flex",justifyContent:"flex-end",gap:6,marginTop:12}}><button onClick={()=>setShowInvForm(false)} style={S.btn2}>キャンセル</button><button onClick={sv} style={{...S.btn1,background:"linear-gradient(135deg,#4A90D9,#357ABD)"}}>登録</button></div></div>}
        <div style={{...S.crd,padding:0,overflow:"hidden"}}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{background:"#f7f8fb"}}>{["SKU","商品名","原価","販売価格","粗利率","FBA","自社","合計","発注点","状態","操作"].map(h=><th key={h} style={{padding:"9px 7px",textAlign:"left",fontWeight:700,color:"#666",fontSize:10}}>{h}</th>)}</tr></thead><tbody>{cur.inventory.map(i=>{const t=i.fba+i.self;const st=t<=i.rp*0.3?"c":t<=i.rp?"l":"ok";return(<tr key={i.id} style={{borderBottom:"1px solid #f0f2f5"}}><td style={{...S.td,fontFamily:"monospace",fontWeight:600}}>{i.sku}</td><td style={{...S.td,fontWeight:600}}>{i.name}</td><td style={S.td}>{fmt(i.cost)}</td><td style={{...S.td,fontWeight:700}}>{fmt(i.price)}</td><td style={S.td}><span style={{background:Number(mg(i))>50?"#ECFDF5":Number(mg(i))>30?"#FFFBEB":"#FEF2F2",color:Number(mg(i))>50?"#166534":Number(mg(i))>30?"#92400E":"#991B1B",padding:"2px 6px",borderRadius:4,fontWeight:700,fontSize:11}}>{mg(i)}%</span></td><td style={S.td}>{i.fba}</td><td style={S.td}>{i.self}</td><td style={{...S.td,fontWeight:700}}>{t}</td><td style={S.td}>{i.rp}</td><td style={S.td}><span style={{padding:"2px 7px",borderRadius:10,fontSize:10,fontWeight:700,background:st==="ok"?"#ECFDF5":st==="l"?"#FFFBEB":"#FEF2F2",color:st==="ok"?"#166534":st==="l"?"#92400E":"#991B1B"}}>{st==="ok"?"✅正常":st==="l"?"⚠️残少":"🚨危険"}</span></td><td style={S.td}><div style={{display:"flex",gap:3}}><button onClick={()=>{setEditInv(i);setNi({sku:i.sku,name:i.name,cost:String(i.cost),price:String(i.price),fba:String(i.fba),self:String(i.self),rp:String(i.rp)});setShowInvForm(true);}} style={S.ibtn}><Edit3 size={12}/></button><button onClick={()=>setInv(p=>p.filter(x=>x.id!==i.id))} style={{...S.ibtn,color:"#EF4444"}}><Trash2 size={12}/></button></div></td></tr>)})}</tbody></table></div></div>
      </div>
    );
  };

  // ===== 節税タブ =====
  const TaxTab = () => {
    const aInc=cur.sales.reduce((s,d)=>s+d.amazon+d.sns+d.support+d.other,0);const aExp=totExp*12;const bl=taxS.blue?650000:100000;const id=taxS.ideco*12;const mu=taxS.mutual*12;const ba=480000;const sp=taxS.spouse?380000:0;const hb=aExp*(taxS.home/100)*0.3;
    const tx=Math.max(0,aInc-aExp-bl-id-mu-ba-sp-taxS.medical-taxS.furu-hb);
    const ct=i=>{const b=[{l:1950000,r:.05,d:0},{l:3300000,r:.10,d:97500},{l:6950000,r:.20,d:427500},{l:9000000,r:.23,d:636000},{l:18000000,r:.33,d:1536000},{l:40000000,r:.40,d:2796000},{l:Infinity,r:.45,d:4796000}];return Math.floor(i*b.find(x=>i<=x.l).r-b.find(x=>i<=x.l).d);};
    const it=ct(tx);const rt=Math.floor(tx*0.10);const tt=it+rt;const er=aInc>0?((tt/aInc)*100).toFixed(1):0;
    const tw=Math.max(0,aInc-aExp-ba-100000);const sv=ct(tw)+Math.floor(tw*0.10)-tt;
    const ded=[{n:"青色申告特別控除",v:bl},ba>0&&{n:"基礎控除",v:ba},id>0&&{n:"iDeCo",v:id},mu>0&&{n:"小規模企業共済",v:mu},sp>0&&{n:"配偶者控除",v:sp},taxS.medical>0&&{n:"医療費控除",v:taxS.medical},taxS.furu>0&&{n:"ふるさと納税",v:taxS.furu},hb>0&&{n:"家事按分",v:Math.floor(hb)}].filter(Boolean);
    const Tgl=({v,fn,l})=><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,fontWeight:600}}>{l}</span><button onClick={()=>fn(!v)} style={{width:42,height:22,borderRadius:11,border:"none",cursor:"pointer",background:v?"#22C55E":"#ddd",position:"relative"}}><div style={{width:16,height:16,borderRadius:8,background:"#fff",position:"absolute",top:3,left:v?23:3,transition:"0.2s",boxShadow:"0 1px 2px rgba(0,0,0,0.2)"}}/></button></div>;
    return(
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <div style={{background:"linear-gradient(135deg,#1a1a2e,#0f3460)",borderRadius:11,padding:18,color:"#fff"}}><h3 style={{margin:"0 0 4px",fontSize:16,fontWeight:800}}>🧮 節税シミュレーション</h3><p style={{margin:0,color:"rgba(255,255,255,0.4)",fontSize:12}}>青色申告の各種控除を活用した税額試算</p></div>
        <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:280}}><div style={{...S.crd,padding:18}}><h4 style={{margin:"0 0 14px",fontSize:13,fontWeight:700}}>⚙️ 控除設定</h4><div style={{display:"flex",flexDirection:"column",gap:14}}><Tgl v={taxS.blue} fn={v=>setTaxS({...taxS,blue:v})} l="青色申告（65万円）"/><Tgl v={taxS.spouse} fn={v=>setTaxS({...taxS,spouse:v})} l="配偶者控除"/>{[{k:"ideco",l:"iDeCo月額",mx:68000},{k:"mutual",l:"小規模企業共済月額",mx:70000},{k:"medical",l:"医療費控除年額",mx:2000000},{k:"furu",l:"ふるさと納税年額",mx:500000},{k:"home",l:"家事按分%",mx:100,sf:"%"}].map(s=><div key={s.k}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:11,fontWeight:600}}>{s.l}</span><span style={{fontSize:11,fontWeight:700,color:"#FF9900"}}>{s.sf?`${taxS[s.k]}%`:fmt(taxS[s.k])}</span></div><input type="range" min={0} max={s.mx} step={s.k==="home"?5:1000} value={taxS[s.k]} onChange={e=>setTaxS({...taxS,[s.k]:Number(e.target.value)})} style={{width:"100%",accentColor:"#FF9900"}}/></div>)}</div></div></div>
          <div style={{flex:1.1,minWidth:320,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",gap:10}}><div style={{...S.crd,flex:1,background:"linear-gradient(135deg,#ECFDF5,#D1FAE5)",borderColor:"#A7F3D0"}}><p style={{fontSize:10,color:"#166534",margin:"0 0 2px",fontWeight:600}}>年間節税額</p><p style={{fontSize:22,fontWeight:900,color:"#14532D",margin:0}}>{fmt(sv)}</p></div><div style={{...S.crd,flex:1}}><p style={{fontSize:10,color:"#8892a4",margin:"0 0 2px",fontWeight:600}}>実効税率</p><p style={{fontSize:22,fontWeight:900,margin:0}}>{er}%</p></div></div>
            <div style={S.crd}>
              <h4 style={{margin:"0 0 10px",fontSize:12,fontWeight:700}}>📋 所得計算</h4>
              {[{l:"年間売上",v:aInc,c:"#FF9900"},{l:"－ 経費",v:-aExp,c:"#EF4444"},{l:"＝ 事業所得",v:aInc-aExp,b:true},...ded.map(d=>({l:`－ ${d.n}`,v:-d.v,c:"#4A90D9"})),{l:"＝ 課税所得",v:tx,b:true,big:true}].map((r,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:r.b?"8px 10px":"5px 10px",background:r.b?"#f7f8fb":"transparent",borderRadius:r.b?6:0,borderBottom:!r.b?"1px solid #f0f2f5":"none"}}><span style={{fontSize:11,fontWeight:r.b?700:500,color:"#555"}}>{r.l}</span><span style={{fontSize:r.big?16:11,fontWeight:r.b?800:600,color:r.c||"#1a1a2e",fontFamily:"monospace"}}>{r.v<0?`△${fmt(Math.abs(r.v))}`:fmt(r.v)}</span></div>)}
              <div style={{display:"flex",gap:10,marginTop:10,padding:10,background:"linear-gradient(135deg,#FFF7ED,#FFEDD5)",borderRadius:8}}>
                {[{l:"所得税",v:it},{l:"住民税",v:rt},{l:"合計",v:tt,b:1}].map((t,i)=><React.Fragment key={i}>{i>0&&<div style={{width:1,background:"#FED7AA"}}/>}<div style={{flex:1,textAlign:"center"}}><p style={{fontSize:9,color:"#C2410C",margin:"0 0 1px"}}>{t.l}</p><p style={{fontSize:t.b?15:13,fontWeight:800,color:t.b?"#991B1B":"#9A3412",margin:0}}>{fmt(t.v)}</p></div></React.Fragment>)}
              </div>
            </div>
            <div style={S.crd}><h4 style={{margin:"0 0 10px",fontSize:12,fontWeight:700}}>📊 節税効果</h4><ResponsiveContainer width="100%" height={140}><BarChart data={[{name:"なし",所得税:ct(tw),住民税:Math.floor(tw*.1)},{name:"あり",所得税:it,住民税:rt}]}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis tick={{fontSize:9}} tickFormatter={v=>`${(v/10000).toFixed(0)}万`}/><Tooltip formatter={v=>fmt(v)}/><Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="所得税" fill="#FF9900" radius={[3,3,0,0]}/><Bar dataKey="住民税" fill="#4A90D9" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div>
            <div style={{background:"#FFFBEB",borderRadius:8,padding:10,border:"1px solid #FDE68A",fontSize:11,color:"#92400E"}}>⚠️ 概算値です。正確な申告は税理士にご確認ください。</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{minHeight:"100vh",background:"#f2f4f8",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif"}}>
      <Header/><Nav/>
      <div style={{padding:"16px 22px",maxWidth:1320,margin:"0 auto"}}>
        {tab==="dashboard"&&<Dashboard/>}
        {tab==="book"&&<BookTab/>}
        {tab==="import"&&<ImportTab/>}
        {tab==="bank"&&<BankTab/>}
        {tab==="inv"&&<InvTab/>}
        {tab==="tax"&&<TaxTab/>}
      </div>
      <div style={{textAlign:"center",padding:"14px 0",color:"#b0b8c8",fontSize:10,borderTop:"1px solid #e6eaf0",marginTop:24}}>BizBoard Pro v4.0 — クレカCSV取込 × 銀行残高管理 × Amazon物販特化 × 青色申告対応 × 完全無料</div>
    </div>
  );
}
