document.getElementById("login").onclick = () => attemptLogin();

document.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("keydown", e => { if (e.key === "Enter") attemptLogin() })
})

async function attemptLogin() {
    const username = document.querySelector('input[type="text"]').value;
    const password = document.querySelector('input[type="password"]').value;
    const warning = document.getElementById("warning");

    if (!username || !password) {
        warning.innerText = "Both username and password must be filled out";
        return;
    }

    warning.innerText = "";

    try {
        const response = await fetch("/api/users/signIn", {
            body: JSON.stringify({ username, password }),
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });

        const results = await response.json();

        if (results === "invalid") {
            warning.innerText = "Invalid username / password";
            return;
        }

        if (results === "banned") {
            warning.innerText = "This account has been banned";
            return;
        }

        if (!Array.isArray(results) || !results[0]) {
            warning.innerText = "Login failed. Please try again.";
            return;
        }

        localStorage.setItem("token", results[0]);
        localStorage.setItem("username", username);

        if (results[1] === "must_reset") {
            showResetForm();
            return;
        }

        document.location = "./dashboard";
    } catch {
        warning.innerText = "Login failed. Please try again.";
    }
}

function showResetForm() {
    document.querySelector(".dashboard").style.display = "none";
    document.getElementById("reset-form").style.display = "flex";
}

document.getElementById("reset-confirm").onclick = () => doReset();

document.querySelectorAll("#reset-form input").forEach(inp => {
    inp.addEventListener("keydown", e => { if (e.key === "Enter") doReset() })
})

async function doReset() {
    const newPass = document.getElementById("reset-new-password").value;
    const confirm = document.getElementById("reset-confirm-password").value;
    const warn = document.getElementById("reset-warning");

    if (!newPass || !confirm) { warn.innerText = "Both fields are required."; return; }
    if (newPass !== confirm) { warn.innerText = "Passwords do not match."; return; }

    const res = await fetch("/api/users/resetPasswordSelf", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify({ newPassword: newPass })
    });

    const data = await res.json();
    if (res.ok && data.worked) {
        document.location = "./dashboard";
    } else {
        warn.innerText = data.error || "Failed to reset password.";
    }
}

auth.isLoggedIn().then(loggedIn => {
    if (loggedIn == true || loggedIn == "true") window.location = "./dashboard";
});
