let editingPrompt = null;
let currentPromptName = null;
let currentUserIsAdmin = false;
let currentUserIsLoggedIn = false;

function authHeaders() {
    return { "Authorization": "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" };
}

function toggleMenu(btn) {
    const dropdown = btn.nextElementSibling;
    const isOpen = dropdown.classList.contains("open");
    document.querySelectorAll(".card-menu-dropdown.open").forEach(d => d.classList.remove("open"));
    if (!isOpen) dropdown.classList.add("open");
}

document.addEventListener("click", (e) => {
    if (!e.target.closest(".card-menu")) {
        document.querySelectorAll(".card-menu-dropdown.open").forEach(d => d.classList.remove("open"));
    }
});

function addPromptCard(name, description, owner, content, isContentPublic = false, canSeeContent = false) {
    const canManage = currentUserIsLoggedIn && (owner === localStorage.getItem("username") || currentUserIsAdmin);
    const canApply = currentUserIsLoggedIn;
    const prompt = document.createElement("div");
    prompt.classList.add("prompt");
    prompt.dataset.name = name;
    prompt.dataset.content = content ?? "";
    prompt.dataset.description = description ?? "";
    prompt.dataset.owner = owner ?? "";
    prompt.dataset.isContentPublic = isContentPublic ? "1" : "0";
    prompt.dataset.canSeeContent = canSeeContent ? "1" : "0";
    prompt.innerHTML = `
        <h4></h4>
        <p class="prompt-desc"></p>
        <p class="prompt-owner"></p>
        <div class="card-actions">
            ${canSeeContent ? '<button class="view-btn">View Prompt</button>' : ''}
            ${canApply ? '<button class="use-btn">Use</button>' : ''}
            ${canManage ? `
            <div class="card-menu">
                <button class="card-menu-btn" onclick="toggleMenu(this)">...</button>
                <div class="card-menu-dropdown">
                    <button class="prompt-edit-btn">Edit</button>
                    <button class="prompt-delete-btn">Delete</button>
                </div>
            </div>
            ` : ''}
        </div>
    `;
    prompt.querySelector("h4").textContent = name;
    prompt.querySelector(".prompt-desc").textContent = description ?? "";
    prompt.querySelector(".prompt-owner").textContent = `By: ${owner}`;
    if (canSeeContent) {
        prompt.querySelector(".view-btn").addEventListener("click", () => openViewPromptModal(name, content ?? ""));
    }
    if (canApply) {
        prompt.querySelector(".use-btn").addEventListener("click", () => openUsePromptModal(name));
    }
    if (canManage) {
        prompt.querySelector(".prompt-edit-btn").addEventListener("click", function() { openEditModal(name, this); });
        prompt.querySelector(".prompt-delete-btn").addEventListener("click", function() { removePrompt(name, this); });
    }
    document.querySelector(".prompts").appendChild(prompt);
}

async function getPrompts() {
    const response = await fetch("/api/getPrompts", { headers: authHeaders() });
    return response.json();
}

function openViewPromptModal(promptName, content) {
    document.getElementById("view-prompt-modal-name").textContent = promptName;
    document.getElementById("view-prompt-content").value = content;
    document.getElementById("view-prompt-modal").style.display = "flex";
}

function closeViewPromptModal() {
    document.getElementById("view-prompt-modal").style.display = "none";
    document.getElementById("view-prompt-content").value = "";
}

document.getElementById("view-prompt-modal").addEventListener("click", function(e) {
    if (e.target === this) closeViewPromptModal();
});

async function loadApiKeysForPrompt() {
    const select = document.getElementById("use-prompt-api-key-select");
    select.innerHTML = '<option value="">Select an API Key</option>';

    if (!currentUserIsLoggedIn) return;

    try {
        const res = await fetch("/api/apikeys", { headers: authHeaders() });
        if (res.ok) {
            const keys = await res.json();
            for (const key of keys) {
                const masked = key.key.slice(0, 8) + "............................" + key.key.slice(-4);
                const opt = document.createElement("option");
                opt.value = key.key;
                opt.textContent = masked;
                select.appendChild(opt);
            }
        }
    } catch (e) {
        console.error("Failed to load API keys:", e);
    }
}

async function openUsePromptModal(promptName) {
    if (!currentUserIsLoggedIn) {
        alert("Sign in to apply prompts to an API key.");
        return;
    }
    currentPromptName = promptName;
    document.getElementById("use-prompt-modal-name").textContent = `Applying prompt: ${promptName}`;
    document.getElementById("use-prompt-api-key-select").value = "";
    await loadApiKeysForPrompt();
    document.getElementById("use-prompt-modal").style.display = "flex";
}

function closeUsePromptModal() {
    document.getElementById("use-prompt-modal").style.display = "none";
    currentPromptName = null;
}

async function applyPromptToKey() {
    if (!currentUserIsLoggedIn) return;
    const apiKey = document.getElementById("use-prompt-api-key-select").value;
    if (!apiKey) return alert("Select an API key.");
    if (!currentPromptName) return;

    try {
        const res = await fetch("/api/addPromptToKey", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ promptName: currentPromptName, apiKey })
        });

        if (res.ok) {
            alert("Prompt applied to API key!");
            closeUsePromptModal();
        } else {
            const err = await res.json();
            alert(err.error ?? "Failed to apply prompt to API key.");
        }
    } catch (e) {
        console.error("Error applying prompt:", e);
        alert("Error applying prompt to API key.");
    }
}

document.getElementById("use-prompt-modal").addEventListener("click", function(e) {
    if (e.target === this) closeUsePromptModal();
});

async function loadApiKeys() {
    const select = document.getElementById("api-key-select");
    select.innerHTML = '<option value="">Select an API Key</option>';

    if (!currentUserIsLoggedIn) return;

    try {
        const res = await fetch("/api/apikeys", { headers: authHeaders() });
        if (res.ok) {
            const keys = await res.json();
            for (const key of keys) {
                const masked = key.key.slice(0, 8) + "............................" + key.key.slice(-4);
                const opt = document.createElement("option");
                opt.value = key.key;
                opt.textContent = masked;
                select.appendChild(opt);
            }
            select.style.display = keys.length > 0 ? "" : "none";
        }
    } catch (e) {
        console.error("Failed to load API keys:", e);
    }
}

async function openCreatePromptModal() {
    if (!currentUserIsLoggedIn) {
        alert("Sign in to create prompts.");
        return;
    }
    editingPrompt = null;
    document.getElementById("name").value = "";
    document.getElementById("name").disabled = false;
    document.getElementById("description").value = "";
    document.getElementById("content").value = "";
    document.getElementById("visibility-select").value = "private";
    document.getElementById("api-key-select").value = "";
    document.querySelector(".modal-header h4").textContent = "Create Prompt";
    document.querySelector(".modal-import-btn").textContent = "Create";
    await loadApiKeys();
    document.getElementById("create-modal").style.display = "flex";
}

function openEditModal(name, btn) {
    const card = btn.closest(".prompt");
    editingPrompt = name;
    document.getElementById("name").value = name;
    document.getElementById("name").disabled = true;
    document.getElementById("description").value = card.dataset.description;
    document.getElementById("content").value = card.dataset.content;
    document.getElementById("visibility-select").value = card.dataset.isContentPublic === "1" ? "public" : "private";
    document.querySelector(".modal-header h4").textContent = "Edit Prompt";
    document.querySelector(".modal-import-btn").textContent = "Save";
    document.getElementById("api-key-select").value = "";
    loadApiKeys();
    document.getElementById("create-modal").style.display = "flex";
}

function closeCreateModal() {
    editingPrompt = null;
    document.getElementById("create-modal").style.display = "none";
    document.getElementById("name").value = "";
    document.getElementById("name").disabled = false;
    document.getElementById("description").value = "";
    document.getElementById("content").value = "";
    document.getElementById("visibility-select").value = "private";
    document.getElementById("api-key-select").value = "";
    document.querySelector(".modal-header h4").textContent = "Create Prompt";
    document.querySelector(".modal-import-btn").textContent = "Create";
}

document.getElementById("create-modal").addEventListener("click", function (e) {
    if (e.target === this) closeCreateModal();
});

function findPromptCard(name) {
    return [...document.querySelectorAll(".prompt")].find(
        card => card.dataset.name === name
    );
}

async function createPrompt() {
    if (!currentUserIsLoggedIn) return;
    const name = document.getElementById("name").value.trim();
    const description = document.getElementById("description").value.trim();
    const content = document.getElementById("content").value.trim();
    const apiKey = document.getElementById("api-key-select").value;
    const isContentPublic = document.getElementById("visibility-select").value === "public";
    if (!name || !content) return;

    if (editingPrompt) {
        const res = await fetch("/api/editPrompt", {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ name: editingPrompt, description, content, apiKey, isContentPublic })
        });
        if (res.ok) {
            const card = findPromptCard(editingPrompt);
            if (card) {
                card.dataset.description = description;
                card.dataset.content = content;
                card.dataset.isContentPublic = isContentPublic ? "1" : "0";
                card.dataset.canSeeContent = "1";
                card.querySelector(".prompt-desc").textContent = description;
            }
            closeCreateModal();
        } else {
            const err = await res.json();
            alert(err.error ?? "Failed to save prompt.");
        }
    } else {
        const res = await fetch("/api/createPrompt", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ name, description, content, apiKey, isContentPublic })
        });
        if (res.ok) {
            addPromptCard(name, description, localStorage.getItem("username"), content, isContentPublic, true);
            closeCreateModal();
        } else {
            const err = await res.json();
            alert(err.error ?? "Failed to create prompt.");
        }
    }
}

async function removePrompt(name, btn) {
    btn.disabled = true;
    const res = await fetch("/api/deletePrompt", {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ name })
    });
    if (res.ok) {
        btn.closest(".prompt")?.remove();
    } else {
        btn.disabled = false;
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Failed to delete prompt.");
    }
}

function filterPrompts(query) {
    const q = (typeof query === "string" ? query : document.getElementById("prompts-search").value).trim().toLowerCase();
    document.querySelectorAll(".prompt").forEach((card) => {
        const haystack = [
            card.dataset.name,
            card.dataset.description,
            card.dataset.canSeeContent === "1" ? card.dataset.content : "",
            card.dataset.owner
        ].join(" ").toLowerCase();
        card.style.display = !q || haystack.includes(q) ? "" : "none";
    });
}

async function init() {
    currentUserIsLoggedIn = await auth.isLoggedIn();
    if (currentUserIsLoggedIn) {
        try {
            const res = await fetch("/api/users/isAdmin", { headers: authHeaders() });
            currentUserIsAdmin = await res.json() === true;
        } catch {}
    }

    const createBtn = document.getElementById("create-prompt-btn");
    if (createBtn) createBtn.style.display = currentUserIsLoggedIn ? "" : "none";

    const backBtn = document.getElementById("back-btn");
    if (backBtn) {
        backBtn.onclick = () => window.location = currentUserIsLoggedIn ? "./dashboard" : "/";
        const label = backBtn.querySelector(".back-label");
        if (label) label.textContent = currentUserIsLoggedIn ? "back" : "home";
    }

    const prompts = await getPrompts();
    document.querySelector(".prompts").innerHTML = "";
    for (const p of prompts) {
        addPromptCard(p.name, p.description, p.owner, p.content, p.isContentPublic === 1 || p.isContentPublic === true, p.canSeeContent === true);
    }
}

init();
