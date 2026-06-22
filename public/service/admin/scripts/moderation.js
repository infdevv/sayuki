const defaultPrompt = `<instructions>
You are a moderator with the goal of preventing the following content from being generated:

- CSAM (Child Sexual Abuse Material): Sexual content involving a minor engaging or being targeted by said content.
- Code generation: Generation of code in any programming language (asides from HTML, CSS and JS related to the conversation)

Utilize the following definitions to make your decision in moderation:

- Minor: Any person under the age of 18, no matter what the legal definition is within the context of the transcript.

Return the following JSON object:

{
"reasoning": "Reason to let the content pass/go through",
"block": true/false,
"confidence": 1-100
}

Where age isn't define, assume all characters are adults, unless obvious, like in the situation in which a character is stated to be in elementary/middle/high school or is stated to be young (which by itself, isn't flag worthy, however, paired with physical attributes can be).

Avoid flagging the transcript if it involves a minor and sexual content by default, ONLY flag if the minor is targeted or involved in said sexual content, if mentioned outside of which in a then non-sexual context, it is fine.
</instructions>`

let allChats = []

function fmtTime(ts) {
    const d = new Date(ts * 1000)
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function search(query) {
    const q = query.toLowerCase()
    document.querySelectorAll(".chat").forEach(card => {
        const match = !q || card.dataset.username.toLowerCase().includes(q)
        card.style.display = match ? "" : "none"
    })
    const visible = [...document.querySelectorAll(".chat")].some(c => c.style.display !== "none")
    document.getElementById("empty").style.display = visible ? "none" : ""
}

async function banUser(username, btn) {
    const reason = prompt(`Ban reason for ${username} (leave blank for none):`)
    if (reason === null) return
    btn.textContent = "banning..."
    btn.disabled = true
    const res = await fetch(`/api/users/ban/${encodeURIComponent(username)}`, {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + localStorage.getItem("token"),
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason })
    })
    if (res.ok) {
        btn.textContent = "banned"
        btn.style.borderColor = "#4caf50"
        btn.style.color = "#4caf50"
    } else {
        btn.textContent = "failed"
        btn.style.borderColor = "#ff6b6b"
        btn.style.color = "#ff6b6b"
        btn.disabled = false
        setTimeout(() => {
            btn.textContent = "ban"
            btn.style.borderColor = ""
            btn.style.color = ""
        }, 2000)
    }
}

function renderConversation(conversation) {
    if (!Array.isArray(conversation) || conversation.length === 0) return "<em style='opacity:0.5'>No conversation recorded</em>"
    return conversation.map(msg => {
        const role = msg.role ?? "?"
        const text = Array.isArray(msg.content)
            ? msg.content.filter(p => p.type === "text").map(p => p.text).join(" ")
            : (typeof msg.content === "string" ? msg.content : "")
        const roleColor = role === "user" ? "#feb5bf" : "rgba(254,181,191,0.55)"
        return `<div style="margin:6px 0"><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:${roleColor};font-weight:600">${role}</span><br><span style="font-size:12px;opacity:0.85;white-space:pre-wrap">${text.replace(/</g,"&lt;")}</span></div>`
    }).join('<hr style="border-color:rgba(254,181,191,0.15);margin:4px 0">')
}

function createChatCard(entry) {
    const card = document.createElement("div")
    card.className = "chat"
    card.dataset.username = entry.username
    card.dataset.id = entry.id

    const convoHtml = renderConversation(entry.conversation)

    card.innerHTML = `
        <div class="chat-header" style="display:flex;align-items:center;gap:10px;padding:4px 6px">
            <span style="font-weight:600;font-size:14px;flex:1">${entry.username}</span>
            <span style="font-size:10px;opacity:0.5">${fmtTime(entry.createdAt)}</span>
            <button class="ban-btn" style="border:2px solid #feb5bf;background:transparent;color:#feb5bf;border-radius:190px;padding:3px 12px;font-size:12px;cursor:pointer;font-family:Inter">ban</button>
            <span class="material-symbols-outlined toggle-icon" style="font-size:18px;opacity:0.6;cursor:pointer">chevron_forward</span>
        </div>
        <div class="chat-reason" style="font-size:11px;opacity:0.6;padding:0 6px 4px;margin-top:2px">${entry.reason.replace(/</g,"&lt;")}</div>
        <div class="chat-body" style="display:none;padding:6px;border-top:1px solid rgba(254,181,191,0.2);margin-top:4px;max-height:300px;overflow-y:auto">${convoHtml}</div>
    `

    card.querySelector(".ban-btn").addEventListener("click", e => {
        e.stopPropagation()
        banUser(entry.username, e.currentTarget)
    })

    card.querySelector(".chat-header").addEventListener("click", () => {
        const body = card.querySelector(".chat-body")
        const icon = card.querySelector(".toggle-icon")
        const open = body.style.display !== "none"
        body.style.display = open ? "none" : ""
        icon.textContent = open ? "chevron_forward" : "expand_more"
    })

    return card
}

async function loadFlaggedChats() {
    const res = await fetch("/api/logs/moderation", {
        headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
    })
    if (!res.ok) return
    allChats = await res.json()

    const container = document.getElementById("chats")
    const empty = document.getElementById("empty")
    container.querySelectorAll(".chat").forEach(c => c.remove())

    if (allChats.length === 0) {
        empty.style.display = ""
        return
    }
    empty.style.display = "none"
    for (const entry of allChats) {
        container.appendChild(createChatCard(entry))
    }
}

document.getElementById("search").addEventListener("input", function(e) {
    search(e.target.value)
})

async function loadContent() {
    const res = await fetch("/api/getModeration", {
        headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
    })
    const info = await res.json()
    document.getElementById("moderationPrompt").value = info.moderationPrompt || defaultPrompt
    document.getElementById("discordWebhook").value = info.apiDiscordWebhook || ""
    document.getElementById("moderationModel").value = info.apiModel || ""
    document.getElementById("apiKey").value = info.apiKey || ""
    document.getElementById("apiUrl").value = info.apiUrl || ""
}

async function saveInfo() {
    const res = await fetch("/api/editModeration", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + localStorage.getItem("token"),
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "apiUrl": document.getElementById("apiUrl").value,
            "apiKey": document.getElementById("apiKey").value,
            "apiModel": document.getElementById("moderationModel").value,
            "apiModelContextWindow": 32 * 1000,
            "apiDiscordWebhook": document.getElementById("discordWebhook").value,
            "moderationPrompt": document.getElementById("moderationPrompt").value,
        })
    })
    return res.ok
}

document.getElementById("saveBtn").addEventListener("click", async function() {
    this.style.transform = "scale(0.96)"
    this.style.opacity = "0.8"
    const ok = await saveInfo()
    this.style.transform = ""
    this.style.opacity = ""
    if (ok) {
        this.textContent = "Saved!"
        this.style.borderColor = "#4caf50"
        this.style.color = "#4caf50"
    } else {
        this.textContent = "Error saving"
        this.style.borderColor = "#ff6b6b"
        this.style.color = "#ff6b6b"
    }
    setTimeout(() => {
        this.textContent = "Save"
        this.style.borderColor = ""
        this.style.color = ""
    }, 2000)
})

loadContent()
loadFlaggedChats()
