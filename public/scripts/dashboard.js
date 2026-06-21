
function getPipi(){
    const nowInPT = new Date(new Date().toLocaleString("en-US", { 
        timeZone: "America/Los_Angeles" 
    }));
    const targetToday = new Date(nowInPT);
    targetToday.setHours(18, 0, 0, 0);
    let targetTime;
    if (nowInPT >= targetToday) {
        targetTime = new Date(targetToday);
        targetTime.setDate(targetTime.getDate() + 1);
    } else {
        targetTime = targetToday;
    }
    const diffMs = targetTime - nowInPT;
    if (diffMs <= 0) return "0:00";
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
}


const time = new Date();
const hour = time.getHours();
const name = document.getElementById("name");
const splash = document.getElementById("splash")
const splashText = [
  "she sayuki it til i proxy",
  "try typing \"pipipipi\" right here",
  "6/20/26",
  "we're all pulling up in 2085 for sayuki 2",
  "hot take: gemma > gemini",
  "open your door its cold out here",
  "<a href=\"https://www.youtube.com/watch?v=3zGPySEUMI0\">peak</a> (you're welcome)",
  "find a bug? ok, eat it",
  "read the tos or else",
  "powerscaling wise: reimu gets slammed by the biden blast",
  "donate to your local angel today",
  ("next pippa stream (usually) is about in " + getPipi() + " (hours/minutes)"),
]

name.textContent = `good ${hour < 12 ? "morning" : "afternoon"}, ${localStorage.getItem("username")}`;
splash.innerHTML = splashText[Math.floor(Math.random() * splashText.length)]

auth.isLoggedIn().then((loggedIn) => {
  if (loggedIn == false || loggedIn == "false") {
    window.location = "./index.html";
  }
});


let cckv = "pipipipi"
let ccki = ""

document.addEventListener("keydown", (e) => {
  ccki += e.key
  if (ccki === cckv) {
    window.location="lastcall.webp"
  }
})