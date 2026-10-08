import {initializeApp} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {getDatabase,ref,set,get,update,onValue,runTransaction} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

/*
 * Firebase 설정
 * 아래 값을 본인의 Firebase Web App 설정으로 교체하세요.
 */
const firebaseConfig={
  apiKey:"AIzaSyBreTSe1m0-xlbF4aupnU5isRZCihR25IE",
  authDomain:"formwheel.firebaseapp.com",
  databaseURL:"https://formwheel-default-rtdb.firebaseio.com",
  projectId:"formwheel",
  storageBucket:"formwheel.firebasestorage.app",
  messagingSenderId:"431583088241",
  appId:"1:431583088241:web:74e0e34ea1e3e1170c55d0"
};

import {getAuth,signInAnonymously} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
const app=initializeApp(firebaseConfig);
const db=getDatabase(app);
const auth=getAuth(app);
let voterId="";
const authReady=(auth.currentUser?Promise.resolve(auth.currentUser):signInAnonymously(auth).then(r=>r.user)).then(u=>{voterId=u.uid;return u});
authReady.catch(()=>{$("createError").textContent="인증에 실패했습니다. Firebase 익명 로그인을 확인해주세요."});

let currentCode="";
let currentName="";
let isHost=false;
let selected=-1;
let unsubscribe=null;

const $=id=>document.getElementById(id);

$("createTab").onclick=()=>{
  $("createTab").classList.add("active");$("joinTab").classList.remove("active");
  $("createBox").classList.remove("hidden");$("joinBox").classList.add("hidden");
};
$("joinTab").onclick=()=>{
  $("joinTab").classList.add("active");$("createTab").classList.remove("active");
  $("joinBox").classList.remove("hidden");$("createBox").classList.add("hidden");
};

window.addChoice=()=>{
  const rows=$("choices").querySelectorAll(".choice-row");
  if(rows.length>=10)return;
  const row=document.createElement("div");
  row.className="choice-row";
  row.innerHTML='<input maxlength="50" placeholder="선택지 '+(rows.length+1)+'"><button class="remove">×</button>';
  row.querySelector("button").onclick=()=>removeChoice(row.querySelector("button"));
  $("choices").appendChild(row);
};
window.removeChoice=btn=>{
  const rows=$("choices").querySelectorAll(".choice-row");
  if(rows.length<=2)return;
  btn.parentElement.remove();
};

function makeCode(){
  return String(Math.floor(1000+Math.random()*9000));
}

window.createRoom=async()=>{
  $("createError").textContent="";
  const title=$("title").value.trim();
  const choices=[...$("choices").querySelectorAll("input")].map(x=>x.value.trim()).filter(Boolean);
  if(!title)return $("createError").textContent="투표 제목을 입력해주세요.";
  if(choices.length<2)return $("createError").textContent="선택지를 2개 이상 입력해주세요.";
  if(new Set(choices).size!==choices.length)return $("createError").textContent="선택지는 서로 달라야 합니다.";

  try{
    await authReady;
    let code="";
    for(let i=0;i<20;i++){
      const candidate=makeCode();
      const claim=await runTransaction(ref(db,"vote/"+candidate),cur=>cur?undefined:{title,choices,status:"waiting",createdAt:Date.now(),host:voterId},{applyLocally:false});
      if(claim.committed){code=candidate;break;}
    }
    if(!code)throw new Error("방 코드 생성에 실패했습니다. 다시 시도해주세요.");
    currentCode=code;currentName="방장";isHost=true;
  }catch(error){$("createError").textContent=error.message;return;}
  openRoom();
};

window.joinRoom=async()=>{
  $("joinError").textContent="";
  const code=$("joinCode").value.trim();
  const name=$("joinName").value.trim();
  if(!/^\d{4}$/.test(code))return $("joinError").textContent="4자리 방 코드를 입력해주세요.";
  if(!name)return $("joinError").textContent="닉네임을 입력해주세요.";
  try{await authReady;}catch{return $("joinError").textContent="인증에 실패했습니다."}
  const snap=await get(ref(db,"vote/"+code));
  if(!snap.exists())return $("joinError").textContent="존재하지 않는 방입니다.";
  currentCode=code;currentName=name;isHost=false;
  openRoom();
};

function openRoom(){
  $("home").classList.add("hidden");
  $("room").classList.remove("hidden");
  $("roomCode").textContent=currentCode;
  $("hostBadge").textContent=isHost?"👑 방장":"참가자: "+currentName;
  selected=-1;
  if(unsubscribe)unsubscribe();
  unsubscribe=onValue(ref(db,"vote/"+currentCode),snap=>{
    if(!snap.exists()){
      alert("방이 종료되었습니다.");
      location.reload();
      return;
    }
    renderRoom(snap.val());
  });
}

function renderRoom(data){
  $("voteTitle").textContent=data.title;
  $("voteState").textContent=
    data.status==="waiting"?"방장이 투표를 시작할 때까지 기다려주세요.":
    data.status==="active"?"투표가 진행 중입니다.":"투표가 종료되었습니다.";

  isHost=data.host===voterId;
  const voted=Object.prototype.hasOwnProperty.call(data.voters||{},voterId);
  $("hostControls").classList.toggle("hidden",!isHost);
  $("startButton").classList.toggle("hidden",data.status!=="waiting");
  $("endButton").classList.toggle("hidden",data.status!=="active");

  const options=$("options");
  options.innerHTML="";
  data.choices.forEach((choice,i)=>{
    const b=document.createElement("button");
    b.className="option"+(selected===i?" selected":"");
    b.textContent=choice;
    b.disabled=data.status!=="active"||voted;
    b.onclick=()=>{selected=i;renderRoom(data)};
    options.appendChild(b);
  });

  $("voteButton").disabled=data.status!=="active"||selected<0||voted;
  $("voteButton").classList.toggle("hidden",data.status==="ended");

  const counts=data.votes||{};
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  $("results").innerHTML="";
  data.choices.forEach((choice,i)=>{
    const count=counts[i]||0;
    const percent=total?Math.round(count/total*100):0;
    const box=document.createElement("div");
    box.className="result";
    box.innerHTML='<div class="result-head"><span></span><span>'+count+'표 ('+percent+'%)</span></div><div class="bar"><div class="fill" style="width:'+percent+'%"></div></div>';
    box.querySelector(".result-head span").textContent=choice;
    $("results").appendChild(box);
  });

  $("voteNotice").classList.toggle("hidden",data.status!=="ended");
  $("voteNotice").textContent=data.status==="ended"?"투표가 종료되었습니다.":"";
}

window.submitVote=async()=>{
 if(selected<0||!voterId)return;const choice=selected;
 try{
 const res=await runTransaction(ref(db,"vote/"+currentCode),data=>{
  if(!data||data.status!=="active"||choice>=data.choices.length||Object.prototype.hasOwnProperty.call(data.voters||{},voterId))return;
  data.votes=data.votes||{};data.voters=data.voters||{};
  data.votes[choice]=Number(data.votes[choice]||0)+1;data.voters[voterId]=choice;return data;
 },{applyLocally:false});
 $("voteNotice").classList.remove("hidden");$("voteNotice").textContent=res.committed?"투표가 완료되었습니다.":"이미 투표했거나 투표가 종료되었습니다.";
 }catch{$("voteNotice").classList.remove("hidden");$("voteNotice").textContent="저장에 실패했습니다. 다시 제출해주세요.";}
};
window.startVote=async()=>{
 await runTransaction(ref(db,"vote/"+currentCode),data=>{
  if(!data||data.host!==voterId||data.status!=="waiting")return;
  data.status="active";data.votes={};data.voters={};return data;
 },{applyLocally:false});
};
window.endVote=async()=>{
 await runTransaction(ref(db,"vote/"+currentCode),data=>{
  if(!data||data.host!==voterId||data.status!=="active")return;
  data.status="ended";return data;
 },{applyLocally:false});
};
window.leaveRoom=()=>{
  if(unsubscribe)unsubscribe();
  location.reload();
};
