// Both Paddling School pages fail closed until the Worker confirms an active member.
window.PaddlingAuth = (() => {
  const worker = "https://mycanoe-map.kohoon0140.workers.dev";
  const getUser = () => { try { return JSON.parse(localStorage.getItem("mc_user") || "null"); } catch (_) { return null; } };
  const setUser = user => { try { user ? localStorage.setItem("mc_user", JSON.stringify(user)) : localStorage.removeItem("mc_user"); } catch (_) {} };
  const login = () => { location.href = worker + "/?back=" + encodeURIComponent(location.origin + location.pathname + location.search); };
  function acceptCallback() {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (!hash.has("login")) return;
    setUser({ uid: hash.get("login"), nick: hash.get("nick") || "", tok: hash.get("tok") || "", t: Date.now() });
    history.replaceState(null, "", location.pathname + location.search);
  }
  async function verify() {
    document.body.classList.remove("school-authorized");
    const gate = document.getElementById("authGate");
    const status = document.getElementById("gateStatus");
    const action = document.getElementById("gateAction");
    gate.hidden = false;
    const user = getUser();
    if (!user || !user.uid || !user.tok) {
      status.textContent = "학습 내용을 보려면 카카오 계정으로 로그인해 주세요.";
      action.textContent = "카카오 로그인";
      action.onclick = login;
      return null;
    }
    status.textContent = "회원 상태를 확인하고 있습니다…";
    action.hidden = true;
    try {
      const response = await fetch(`${worker}/paddling-state?uid=${encodeURIComponent(user.uid)}&tok=${encodeURIComponent(user.tok)}`, { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        status.textContent = "로그인 정보가 만료되었거나 회원가입이 필요합니다. 카누맵에서 로그인·회원가입을 완료해 주세요.";
        action.textContent = "카누맵에서 로그인·회원가입";
        action.onclick = () => { location.href = new URL("/", location.origin).href; };
      } else if (response.ok) {
        const state = await response.json();
        if (!state.ok) throw new Error("invalid state");
        document.body.classList.add("school-authorized");
        gate.hidden = true;
        return state;
      } else throw new Error("server unavailable");
    } catch (_) {
      status.textContent = "회원 확인에 실패했습니다. 연결 상태를 확인하고 다시 시도해 주세요.";
      action.textContent = "다시 시도";
      action.onclick = verify;
    }
    action.hidden = false;
    return null;
  }
  return { acceptCallback, getUser, setUser, login, verify };
})();
