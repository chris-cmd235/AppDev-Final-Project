const api = path => `/api${path}`;
let authToken = localStorage.getItem('authToken');
let currentUser = null;
let allContacts = []; 

// Check if we are "Impersonating" someone (Admin feature)
let impersonateId = localStorage.getItem('impersonateId');
let impersonateName = localStorage.getItem('impersonateName');

function $id(id) { return document.getElementById(id); }
function getAuthHeaders() { return { 'Authorization': `Bearer ${authToken}` }; }

// ==================== PAGE ROUTING & SECURITY ====================

async function initPage() {
  const isLoginPage = document.body.classList.contains('page-login');
  const isAdminPage = document.body.classList.contains('page-admin');
  const isDashboard = document.body.classList.contains('page-dashboard');

  if (!authToken) {
    if (isLoginPage) setupLoginUI();
    else window.location.href = 'login.html';
    return;
  }

  if (authToken) {
    const valid = await verifyAuth();
    if (!valid) { logout(); return; }

    // Routing Logic
    if (isLoginPage) {
      if (currentUser.role === 'admin') window.location.href = 'admin.html';
      else window.location.href = 'index.html';
      return;
    }

    if (isAdminPage && currentUser.role !== 'admin') {
      window.location.href = 'index.html';
      return;
    }

    if (isDashboard && currentUser.role === 'admin' && !impersonateId) {
      alert("Admins must access the dashboard via the User List.");
      window.location.href = 'admin.html';
      return;
    }

    setupUI();
  }
}

async function verifyAuth() {
  try {
    const res = await fetch(api('/auth/verify'), { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      return true;
    }
    return false;
  } catch (err) { return false; }
}

function logout() {
  localStorage.removeItem('authToken');
  stopImpersonating(); 
  window.location.href = 'login.html';
}

function stopImpersonating() {
  localStorage.removeItem('impersonateId');
  localStorage.removeItem('impersonateName');
  if (currentUser && currentUser.role === 'admin') window.location.href = 'admin.html';
}

function setupUI() {
  const usernameLabel = $id('navUsername') || $id('adminUsername');
  const navRole = $id('navRole');
  const navAdminBtn = $id('navAdminBtn');
  
  if (usernameLabel) {
    if ($id('navUsername') && impersonateId && impersonateName) {
      usernameLabel.innerHTML = `<span style="color: #333; font-weight: bold;">Viewing: ${impersonateName}</span>`;
      if (!$id('stopImpBtn')) {
        const btn = document.createElement('button');
        btn.id = 'stopImpBtn';
        btn.className = 'btn-secondary';
        btn.textContent = '🛑 Stop Viewing';
        btn.onclick = stopImpersonating;
        document.querySelector('.navbar-menu').prepend(btn);
      }
    } else {
      usernameLabel.textContent = currentUser.username;
    }
  }

  if (navRole) {
    navRole.textContent = currentUser.role.toUpperCase();
    navRole.className = `role-badge ${currentUser.role}`;
  }
  
  if (navAdminBtn && currentUser.role === 'admin') navAdminBtn.classList.remove('hidden');

  const logoutBtns = document.querySelectorAll('.btn-logout');
  logoutBtns.forEach(btn => btn.addEventListener('click', logout));

  if (document.querySelector('.page-dashboard')) initDashboard();
  if (document.querySelector('.page-admin')) initAdmin();
}

// ==================== LOGIN / SIGNUP LOGIC ====================

function setupLoginUI() {
  $id('showSignup').onclick = (e) => {
    e.preventDefault();
    $id('loginForm').classList.add('hidden');
    $id('signupForm').classList.remove('hidden');
    $id('pageTitle').textContent = 'Create Account';
  };

  $id('showLogin').onclick = (e) => {
    e.preventDefault();
    $id('signupForm').classList.add('hidden');
    $id('loginForm').classList.remove('hidden');
    $id('pageTitle').textContent = 'Welcome Back';
  };

  $id('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = '...';

    const username = $id('loginUsername').value.trim();
    const password = $id('loginPassword').value;

    try {
      const res = await fetch(api('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('authToken', data.token);
        if (data.user.role === 'admin') window.location.href = 'admin.html';
        else window.location.href = 'index.html';
      } else {
        $id('loginError').textContent = data.error;
        $id('loginError').classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    } catch (err) {
      alert('Server Error');
      btn.disabled = false;
    }
  });

  $id('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;

    const username = $id('signupUsername').value.trim();
    const password = $id('signupPassword').value;

    try {
      const res = await fetch(api('/auth/signup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (res.ok) {
        alert('Account created! Please sign in.');
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error);
        btn.disabled = false;
      }
    } catch (err) { alert('Server Error'); btn.disabled = false; }
  });
}

// ==================== DASHBOARD LOGIC ====================

function initDashboard() {
  fetchContactsData();
  
  // Sorting and Filter Listeners
  $id('search').addEventListener('input', applyControls);
  $id('sortBy').addEventListener('change', applyControls);
  
  // Form Listeners
  $id('newBtn').addEventListener('click', () => openForm(null));
  $id('closeFormBtn').addEventListener('click', closeForm);
  $id('cancelFormBtn').addEventListener('click', closeForm);
  $id('contactForm').addEventListener('submit', handleContactSubmit);
}

async function fetchContactsData() {
  try {
    let url = '/contacts';
    if (impersonateId) url += `?targetUserId=${impersonateId}`;

    const res = await fetch(api(url), { headers: getAuthHeaders() });
    if (!res.ok) throw new Error();
    allContacts = await res.json();
    applyControls();
  } catch (err) { console.error(err); }
}

function applyControls() {
  const query = $id('search').value.toLowerCase().trim();
  const sortType = $id('sortBy').value;

  let filtered = allContacts.filter(c => 
    (c.name && c.name.toLowerCase().includes(query)) ||
    (c.email && c.email.toLowerCase().includes(query)) ||
    (c.phone && c.phone.includes(query))
  );

  filtered.sort((a, b) => {
    const dateA = new Date(a.created_at); 
    const dateB = new Date(b.created_at);
    switch(sortType) {
      case 'az': return a.name.localeCompare(b.name);
      case 'za': return b.name.localeCompare(a.name);
      case 'newest': return dateB - dateA;
      case 'oldest': return dateA - dateB;
      default: return 0;
    }
  });

  renderContacts(filtered);
}

function renderContacts(contacts) {
  const list = $id('contacts');
  const empty = $id('emptyState');
  list.innerHTML = '';

  if (contacts.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  contacts.forEach(c => {
    const li = document.createElement('li');
    li.className = 'contact-item';
    li.innerHTML = `
      <div class="contact-avatar">${c.icon ? `<img src="${c.icon}">` : c.name[0]}</div>
      <div class="contact-info">
        <div class="contact-name">${escapeHtml(c.name)}</div>
        <div class="contact-details">
          ${c.email ? `<span>📧 ${escapeHtml(c.email)}</span>` : ''}
          ${c.phone ? `<span>📱 ${escapeHtml(c.phone)}</span>` : ''}
        </div>
        
        ${c.notes ? `
          <div class="contact-description">
            <small>📝 Notes:</small>
            <p>${escapeHtml(c.notes)}</p>
          </div>
        ` : ''}
        
      </div>
      <div class="contact-actions">
        <button class="btn-icon-text btn-edit">✏️ Edit</button>
        <button class="btn-icon-text btn-delete">🗑️ Delete</button>
      </div>
    `;
    li.querySelector('.btn-edit').onclick = () => openForm(c);
    li.querySelector('.btn-delete').onclick = () => deleteContact(c);
    list.appendChild(li);
  });
}

// Form Handlers
function openForm(contact) {
  $id('formWrap').classList.remove('hidden');
  $id('formTitle').textContent = contact ? 'Edit Contact' : 'New Contact';
  $id('contactId').value = contact?.id || '';
  $id('name').value = contact?.name || '';
  $id('email').value = contact?.email || '';
  $id('phone').value = contact?.phone || '';
  $id('notes').value = contact?.notes || '';
}

function closeForm() { $id('formWrap').classList.add('hidden'); }

async function handleContactSubmit(e) {
  e.preventDefault();
  const id = $id('contactId').value;
  const name = $id('name').value.trim();
  const email = $id('email').value.trim();
  const phone = $id('phone').value.trim();
  const notes = $id('notes').value.trim();
  const iconInput = $id('icon');
  
  if (!name) { alert('Name is required'); return; }

  const formData = new FormData();
  formData.append('name', name);
  if (email) formData.append('email', email);
  if (phone) formData.append('phone', phone);
  if (notes) formData.append('notes', notes);
  if (iconInput.files[0]) formData.append('icon', iconInput.files[0]);

  if (impersonateId) {
    formData.append('targetUserId', impersonateId);
  }

  const method = id ? 'PUT' : 'POST';
  const url = id ? api(`/contacts/${id}`) : api('/contacts');

  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    const res = await fetch(url, {
      method: method,
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });
    if (res.ok) {
      closeForm();
      fetchContactsData();
      e.target.reset();
    } else {
      const data = await res.json();
      alert('Error: ' + data.error);
    }
  } catch (err) { 
    alert('Connection Error'); 
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function deleteContact(c) {
  if(confirm('Delete ' + c.name + '?')) {
    await fetch(api(`/contacts/${c.id}`), { method: 'DELETE', headers: getAuthHeaders() });
    fetchContactsData();
  }
}

// ==================== ADMIN LOGIC ====================

function initAdmin() {
  loadUsers();
  $id('refreshUsersBtn').addEventListener('click', loadUsers);
  $id('registerForm').addEventListener('submit', handleRegister);
}

// IMPERSONATION: Function to switch context
window.viewAsUser = function(id, username) {
  if (confirm(`View contacts as ${username}?`)) {
    localStorage.setItem('impersonateId', id);
    localStorage.setItem('impersonateName', username);
    window.location.href = 'index.html'; // Go to dashboard
  }
};

async function loadUsers() {
  const res = await fetch(api('/users'), { headers: getAuthHeaders() });
  const users = await res.json();
  renderUsers(users);
  updateStats(users);
}

function renderUsers(users) {
  const tbody = $id('usersTableBody');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-avatar small">${u.username[0].toUpperCase()}</div>
          <span>${escapeHtml(u.username)}</span>
        </div>
      </td>
      <td><span class="role-badge ${u.role}">${u.role}</span></td>
      <td>${new Date(u.created_at).toLocaleDateString()}</td>
      <td>
        <div style="display:flex; gap:10px; align-items:center;">
          ${u.role !== 'admin' ? 
            `<button onclick="viewAsUser('${u.id}', '${escapeHtml(u.username)}')" class="btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" title="View User's Contacts">👁️ View</button>` 
            : ''}
          ${u.id !== currentUser.id ? 
            `<button onclick="deleteUser('${u.id}')" class="btn-delete-user" title="Delete User">🗑️</button>` 
            : '<span style="color:#999; font-size:0.85rem; font-style:italic;">(You)</span>'}
        </div>
      </td>
    </tr>
  `).join('');
}

function updateStats(users) {
  $id('statTotalUsers').textContent = users.length;
  $id('statRegularUsers').textContent = users.filter(u => u.role === 'user').length;
  $id('statAdmins').textContent = users.filter(u => u.role === 'admin').length;
}

// Admin Helper Functions
async function handleRegister(e) {
  e.preventDefault();
  const username = $id('regUsername').value.trim();
  const password = $id('regPassword').value;
  const role = $id('regRole').value;
  
  if (!username || !password) return alert('Fill all fields');

  try {
    const res = await fetch(api('/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ username, password, role })
    });
    if (res.ok) { alert('User created'); e.target.reset(); loadUsers(); }
    else { const data = await res.json(); alert(data.error); }
  } catch (err) { alert('Error'); }
}

async function deleteUser(id) {
  if(!confirm('Delete User?')) return;
  await fetch(api(`/users/${id}`), { method: 'DELETE', headers: getAuthHeaders() });
  loadUsers();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initPage);