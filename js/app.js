// ====================== GLOBAL STATE ======================
let currentUser = null;          // Firebase Auth user
let currentUserData = null;      // Firestore user document
let cachedReports = [];

// ====================== HELPERS ======================
function showAlert(message, title = "Notice") {
    document.getElementById('alertTitle').innerText = title;
    document.getElementById('alertMessage').innerText = message;
    document.getElementById('alertModal').classList.remove('hidden');
}
function closeAlertModal() {
    document.getElementById('alertModal').classList.add('hidden');
}

let confirmCallback = null;
function showConfirm(message, callback, title = "Are you sure?") {
    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmMessage').innerText = message;
    confirmCallback = callback;
    document.getElementById('confirmModal').classList.remove('hidden');
}
function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    confirmCallback = null;
}
document.getElementById('confirmActionBtn').onclick = function () {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
};

// ====================== MODAL CONTROLS ======================
function openLoginModal() { document.getElementById('loginModal').classList.remove('hidden'); }
function closeLoginModal() { document.getElementById('loginModal').classList.add('hidden'); }

function openRegisterModal() { document.getElementById('registerModal').classList.remove('hidden'); }
function closeRegisterModal() { document.getElementById('registerModal').classList.add('hidden'); }

function openAdminCreateModal() { document.getElementById('adminCreateModal').classList.remove('hidden'); }
function closeAdminCreateModal() { document.getElementById('adminCreateModal').classList.add('hidden'); }

function openReportModal(report = null) {
    if (report) {
        document.getElementById('reportModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square text-indigo-600 mr-2"></i> Edit Report';
        document.getElementById('reportId').value = report.id;
        document.getElementById('reportType').value = report.type;
        document.getElementById('reportItemName').value = report.item_name;
        document.getElementById('reportDescription').value = report.description || '';
        document.getElementById('reportPlace').value = report.place || '';
        document.getElementById('reportDate').value = report.date || '';
        document.getElementById('reportImageBase64').value = report.image || '';
    } else {
        document.getElementById('reportModalTitle').innerHTML = '<i class="fa-solid fa-file-circle-plus text-indigo-600 mr-2"></i> New Report';
        document.getElementById('reportId').value = '';
        document.getElementById('reportType').value = 'lost';
        document.getElementById('reportItemName').value = '';
        document.getElementById('reportDescription').value = '';
        document.getElementById('reportPlace').value = '';
        document.getElementById('reportDate').value = '';
        document.getElementById('reportImageFile').value = '';
        document.getElementById('reportImageBase64').value = '';
    }
    document.getElementById('reportModal').classList.remove('hidden');
}
function closeReportModal() { document.getElementById('reportModal').classList.add('hidden'); }

function openClaimModal(reportId) {
    document.getElementById('claimReportId').value = reportId;
    document.getElementById('claimProofText').value = '';
    document.getElementById('claimModal').classList.remove('hidden');
}
function closeClaimModal() { document.getElementById('claimModal').classList.add('hidden'); }

function openChatModal(reportId) {
    document.getElementById('chatReportId').value = reportId;
    const report = cachedReports.find(r => r.id === reportId);
    renderChatMessages(report ? report.messages || [] : []);
    document.getElementById('chatModal').classList.remove('hidden');
}
function closeChatModal() { document.getElementById('chatModal').classList.add('hidden'); }

// Image to Base64
document.getElementById('reportImageFile').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = function () {
            document.getElementById('reportImageBase64').value = reader.result;
        };
        reader.readAsDataURL(file);
    }
});

// ====================== AUTH ======================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            currentUserData = doc.data();
            showDashboard();
        } else {
            // Should not happen, but just in case
            await auth.signOut();
        }
    } else {
        currentUser = null;
        currentUserData = null;
        showLanding();
    }
});

function showLanding() {
    document.getElementById('landing').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('nav-auth').innerHTML = `
        <div class="space-x-3">
            <button onclick="openLoginModal()" class="text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-2 transition">
                <i class="fa-solid fa-right-to-bracket mr-1"></i> Login
            </button>
            <button onclick="openRegisterModal()" class="text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition shadow-sm">
                <i class="fa-solid fa-user-plus mr-1"></i> Register
            </button>
        </div>
    `;
}

function showDashboard() {
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');

    const role = currentUserData.role;
    document.getElementById('nav-auth').innerHTML = `
        <div class="flex items-center space-x-4">
            <span class="text-sm font-medium text-slate-600 hidden sm:inline">
                <i class="fa-solid fa-user-circle text-indigo-500 mr-1"></i> Hi, 
                <span class="text-indigo-600 font-semibold">${currentUserData.username}</span>
            </span>
            <span class="text-xs uppercase bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-semibold">
                <i class="fa-solid fa-shield-halved mr-1"></i> ${role}
            </span>
            <button onclick="handleLogout()" class="text-sm font-medium text-red-600 hover:text-red-700 transition flex items-center gap-1">
                <i class="fa-solid fa-right-from-bracket"></i> Logout
            </button>
        </div>
    `;

    // Show New Report button only for normal users
    document.getElementById('btn-new-report').classList.toggle('hidden', role !== 'user');

    // Admin stats + user management
    const isAdmin = role === 'admin';
    document.getElementById('admin-stats').classList.toggle('hidden', !isAdmin);
    document.getElementById('admin-users-section').classList.toggle('hidden', !isAdmin);

    loadReports();
    if (isAdmin) loadUsers();
}

// ====================== REGISTER ======================
async function handleRegister(event) {
    event.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const contact = document.getElementById('regContact').value.trim();
    const address = document.getElementById('regAddress').value.trim();

    if (!/^[0-9]{11}$/.test(contact)) {
        showAlert("Contact number must be exactly 11 digits.", "Validation Error");
        return;
    }

    try {
        // Check if username already exists
        const usernameCheck = await db.collection('users').where('username', '==', username).get();
        if (!usernameCheck.empty) {
            showAlert("Username already taken.", "Error");
            return;
        }

        // Create Auth account
        const cred = await auth.createUserWithEmailAndPassword(email, password);

        // Check if this is the first user → make admin
        const allUsers = await db.collection('users').get();
        const role = allUsers.empty ? 'admin' : 'user';

        // Save profile
        await db.collection('users').doc(cred.user.uid).set({
            id: cred.user.uid,
            username,
            email,
            contact,
            address,
            role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showAlert("Account created successfully!", "Success");
        closeRegisterModal();
    } catch (error) {
        showAlert(error.message, "Registration Failed");
    }
}

// ====================== LOGIN ======================
async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
        await auth.signInWithEmailAndPassword(email, password);
        closeLoginModal();
    } catch (error) {
        showAlert("Invalid email or password.", "Login Failed");
    }
}

function handleLogout() {
    auth.signOut();
}

// ====================== REPORTS ======================
async function loadReports() {
    const container = document.getElementById('reports-container');
    container.innerHTML = `<p class="text-sm text-slate-500">Loading reports...</p>`;

    try {
        const snapshot = await db.collection('reports').orderBy('createdAt', 'desc').get();
        cachedReports = [];
        snapshot.forEach(doc => {
            cachedReports.push({ id: doc.id, ...doc.data() });
        });

        // Admin stats
        if (currentUserData.role === 'admin') {
            document.getElementById('stat-total').innerText = cachedReports.length;
            document.getElementById('stat-active').innerText = cachedReports.filter(r => r.status === 'active').length;
            document.getElementById('stat-pending').innerText = cachedReports.filter(r => r.status === 'pending_approval').length;
            document.getElementById('stat-claimed').innerText = cachedReports.filter(r => r.status === 'claimed').length;
        }

        if (cachedReports.length === 0) {
            container.innerHTML = `<p class="text-sm text-slate-500 col-span-full">No reports found.</p>`;
            return;
        }

        renderReports();
    } catch (error) {
        container.innerHTML = `<p class="text-sm text-red-500">Error loading reports.</p>`;
        console.error(error);
    }
}

function renderReports() {
    const container = document.getElementById('reports-container');
    const role = currentUserData.role;
    const uid = currentUser.uid;

    container.innerHTML = cachedReports.map(r => {
        const isMyReport = r.reporter_id === uid;
        const isStaffOrAdmin = role === 'admin' || role === 'staff';
        const claims = r.claims || [];
        const hasAlreadyClaimed = claims.some(c => c.user_id === uid);
        const messages = r.messages || [];

        let statusColor = 'bg-amber-50 text-amber-700 border border-amber-200';
        if (r.status === 'claimed') statusColor = 'bg-blue-50 text-blue-700 border border-blue-200';
        if (r.status === 'pending_approval') statusColor = 'bg-purple-50 text-purple-700 border border-purple-200';

        return `
            <div class="border border-slate-200 rounded-2xl p-5 bg-white shadow-sm flex flex-col justify-between space-y-4 hover:border-slate-300 transition">
                <div class="space-y-3">
                    <div class="flex justify-between items-center">
                        <span class="px-3 py-1 text-xs font-semibold rounded-full uppercase ${r.type === 'lost' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
                            <i class="fa-solid ${r.type === 'lost' ? 'fa-circle-question' : 'fa-circle-check'} mr-1"></i> ${r.type}
                        </span>
                        <span class="text-xs px-2.5 py-0.5 rounded-md font-medium ${statusColor}">${r.status || 'active'}</span>
                    </div>

                    ${r.image ? `
                        <div class="w-full h-48 bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
                            <img src="${r.image}" alt="${r.item_name}" class="w-full h-full object-cover">
                        </div>
                    ` : ''}

                    <div>
                        <h4 class="font-bold text-slate-900 text-lg">${r.item_name}</h4>
                        <p class="text-sm text-slate-600 line-clamp-2 mt-1">${r.description || 'No description provided.'}</p>
                    </div>
                </div>

                <div class="text-xs text-slate-500 space-y-2 pt-3 border-t border-slate-100">
                    <p class="flex items-center gap-1.5"><i class="fa-solid fa-location-dot text-indigo-500"></i> <span class="text-slate-700 font-medium">${r.place || 'N/A'}</span></p>
                    <p class="flex items-center gap-1.5"><i class="fa-solid fa-calendar-days text-indigo-500"></i> <span class="text-slate-700 font-medium">${r.date || 'N/A'}</span></p>

                    ${isStaffOrAdmin && claims.length > 0 ? `
                        <div class="bg-purple-50 p-3 rounded-xl space-y-2 border border-purple-100">
                            <p class="font-bold text-purple-800 text-xs"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Pending Claims (${claims.length}):</p>
                            ${claims.map(c => `
                                <div class="bg-white p-2.5 rounded-lg border border-purple-200 space-y-1 shadow-sm">
                                    <p class="font-semibold text-slate-800"><i class="fa-solid fa-user mr-1 text-purple-500"></i> ${c.username}</p>
                                    <p class="text-slate-600 italic">Proof: "${c.proof}"</p>
                                    ${r.status === 'pending_approval' ? `
                                        <div class="flex gap-2 pt-1.5">
                                            <button onclick="processApproval('${r.id}', 'accept', '${c.claim_id}')" class="text-xs bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-emerald-700 transition font-medium">
                                                <i class="fa-solid fa-check mr-1"></i> Accept
                                            </button>
                                            <button onclick="processApproval('${r.id}', 'reject', '${c.claim_id}')" class="text-xs bg-red-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-red-700 transition font-medium">
                                                <i class="fa-solid fa-xmark mr-1"></i> Reject
                                            </button>
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    <div class="flex justify-between items-center pt-2">
                        <span class="text-slate-500"><i class="fa-solid fa-circle-user mr-1"></i> By: <span class="text-slate-700 font-semibold">${r.reporter_username}</span></span>
                        
                        <div class="flex items-center gap-1.5 flex-wrap justify-end">
                            <button onclick="openChatModal('${r.id}')" class="text-xs bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-200 transition font-medium flex items-center gap-1">
                                <i class="fa-solid fa-comments"></i> Chat (${messages.length})
                            </button>

                            ${hasAlreadyClaimed ? `<span class="text-xs bg-purple-100 text-purple-700 font-medium px-2.5 py-1 rounded-lg">Claim Pending</span>` : ''}

                            ${r.status !== 'claimed' && !(r.type === 'found' && isMyReport) && role === 'user' && !hasAlreadyClaimed ? `
                                <button onclick="openClaimModal('${r.id}')" class="text-xs bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700 transition font-medium">
                                    <i class="fa-solid fa-hand-holding-heart mr-1"></i> Claim
                                </button>
                            ` : ''}

                            ${isMyReport && r.status === 'active' ? `
                                <button onclick='openReportModal(${JSON.stringify(r).replace(/'/g, "&#39;")})' class="text-xs bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-200 transition font-medium">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                            ` : ''}

                            ${(isMyReport || isStaffOrAdmin) ? `
                                <button onclick="deleteReport('${r.id}')" class="text-xs bg-red-50 text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-100 transition font-medium">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ====================== CREATE / UPDATE REPORT ======================
async function handleSaveReport(event) {
    event.preventDefault();
    const reportId = document.getElementById('reportId').value;
    const type = document.getElementById('reportType').value;
    const item_name = document.getElementById('reportItemName').value.trim();
    const description = document.getElementById('reportDescription').value.trim();
    const place = document.getElementById('reportPlace').value.trim();
    const date = document.getElementById('reportDate').value;
    const image = document.getElementById('reportImageBase64').value;

    try {
        if (reportId) {
            // Update
            await db.collection('reports').doc(reportId).update({
                item_name, description, place, date, image
            });
            showAlert("Report updated successfully!", "Success");
        } else {
            // Create
            await db.collection('reports').add({
                type,
                item_name,
                description,
                place,
                date,
                image,
                status: 'active',
                reporter_id: currentUser.uid,
                reporter_username: currentUserData.username,
                claims: [],
                messages: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showAlert("Report created successfully!", "Success");
        }
        closeReportModal();
        loadReports();
    } catch (error) {
        showAlert(error.message, "Error");
    }
}

// ====================== CLAIM ======================
async function submitClaimWithProof() {
    const reportId = document.getElementById('claimReportId').value;
    const proof = document.getElementById('claimProofText').value.trim();

    if (!proof) {
        showAlert("Please enter proof details.", "Required");
        return;
    }

    try {
        const reportRef = db.collection('reports').doc(reportId);
        const doc = await reportRef.get();
        if (!doc.exists) return;

        const report = doc.data();
        const claims = report.claims || [];

        if (claims.some(c => c.user_id === currentUser.uid)) {
            showAlert("You already claimed this item.", "Error");
            return;
        }

        claims.push({
            claim_id: db.collection('reports').doc().id,
            user_id: currentUser.uid,
            username: currentUserData.username,
            proof
        });

        await reportRef.update({
            status: 'pending_approval',
            claims
        });

        closeClaimModal();
        showAlert("Claim submitted for review!", "Success");
        loadReports();
    } catch (error) {
        showAlert(error.message, "Error");
    }
}

// ====================== APPROVAL ======================
async function processApproval(reportId, action, claimId) {
    const msg = action === 'accept' ? "Accept this claim?" : "Reject this claim?";
    showConfirm(msg, async () => {
        try {
            const reportRef = db.collection('reports').doc(reportId);
            const doc = await reportRef.get();
            const report = doc.data();
            let claims = report.claims || [];

            if (action === 'accept') {
                await reportRef.update({ status: 'claimed' });
            } else {
                claims = claims.filter(c => c.claim_id !== claimId);
                const updateData = { claims };
                if (claims.length === 0) updateData.status = 'active';
                await reportRef.update(updateData);
            }
            loadReports();
        } catch (error) {
            showAlert(error.message, "Error");
        }
    }, `Confirm ${action.toUpperCase()}`);
}

// ====================== DELETE REPORT ======================
function deleteReport(reportId) {
    showConfirm("Are you sure you want to delete this report?", async () => {
        try {
            await db.collection('reports').doc(reportId).delete();
            loadReports();
        } catch (error) {
            showAlert(error.message, "Error");
        }
    }, "Delete Report");
}

// ====================== CHAT ======================
function renderChatMessages(messages) {
    const container = document.getElementById('chatMessagesContainer');
    if (!messages || messages.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No messages yet.</p>`;
        return;
    }
    container.innerHTML = messages.map(m => `
        <div class="p-3 rounded-xl text-xs space-y-1 ${m.sender_id === currentUser.uid ? 'bg-indigo-50 border border-indigo-100 ml-8' : 'bg-white border border-slate-200 mr-8'}">
            <div class="font-semibold text-slate-700">
                <i class="fa-solid fa-user mr-1 text-indigo-500"></i> ${m.sender_username} (${m.sender_role})
            </div>
            <p class="text-slate-800">${m.message}</p>
        </div>
    `).join('');
    container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
    const reportId = document.getElementById('chatReportId').value;
    const message = document.getElementById('chatInputMessage').value.trim();
    if (!message) return;

    try {
        const reportRef = db.collection('reports').doc(reportId);
        const doc = await reportRef.get();
        const messages = doc.data().messages || [];

        messages.push({
            sender_id: currentUser.uid,
            sender_username: currentUserData.username,
            sender_role: currentUserData.role,
            message,
            timestamp: new Date().toISOString()
        });

        await reportRef.update({ messages });
        document.getElementById('chatInputMessage').value = '';
        renderChatMessages(messages);

        // Update cache
        const report = cachedReports.find(r => r.id === reportId);
        if (report) report.messages = messages;
    } catch (error) {
        showAlert("Failed to send message.", "Error");
    }
}

// ====================== ADMIN: USERS ======================
async function loadUsers() {
    const container = document.getElementById('users-container');
    try {
        const snapshot = await db.collection('users').get();
        let html = `
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                        <th class="py-3 px-4">Username</th>
                        <th class="py-3 px-4">Email</th>
                        <th class="py-3 px-4">Role</th>
                        <th class="py-3 px-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody class="text-sm divide-y divide-slate-100">
        `;

        snapshot.forEach(doc => {
            const u = doc.data();
            html += `
                <tr>
                    <td class="py-3.5 px-4 font-medium text-slate-900">${u.username}</td>
                    <td class="py-3.5 px-4 text-slate-600">${u.email}</td>
                    <td class="py-3.5 px-4"><span class="px-2.5 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-700">${u.role}</span></td>
                    <td class="py-3.5 px-4 text-right space-x-2">
                        ${u.role !== 'admin' || u.username !== currentUserData.username ? `
                            <button onclick="deleteUser('${doc.id}', '${u.username}')" class="text-xs text-red-600 hover:text-red-800 font-medium px-2.5 py-1 rounded-md bg-red-50 transition">
                                <i class="fa-solid fa-trash"></i> Delete
                            </button>
                        ` : `<span class="text-xs text-slate-400 italic">Protected</span>`}
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<p class="text-sm text-red-500">Error loading users.</p>`;
    }
}

async function handleAdminCreateUser(event) {
    event.preventDefault();
    const role = document.getElementById('adminNewRole').value;
    const username = document.getElementById('adminNewUsername').value.trim();
    const email = document.getElementById('adminNewEmail').value.trim();
    const password = document.getElementById('adminNewPassword').value;

    try {
        // Create Auth account
        const cred = await auth.createUserWithEmailAndPassword(email, password);

        await db.collection('users').doc(cred.user.uid).set({
            id: cred.user.uid,
            username,
            email,
            contact: 'N/A',
            address: 'N/A',
            role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Sign back in as the original admin (createUser signs you in as the new user)
        // We need to re-login the admin. For simplicity, just show success and reload.
        showAlert(`${role} account created! Please log out and log back in as admin.`, "Success");
        closeAdminCreateModal();
        // Force logout so admin can login again
        await auth.signOut();
    } catch (error) {
        showAlert(error.message, "Error");
    }
}

function deleteUser(userId, username) {
    showConfirm(`Delete user "${username}"?`, async () => {
        try {
            await db.collection('users').doc(userId).delete();
            // Note: This does not delete the Auth account (requires Admin SDK)
            loadUsers();
            showAlert("User deleted from database.", "Success");
        } catch (error) {
            showAlert(error.message, "Error");
        }
    }, "Delete User");
}