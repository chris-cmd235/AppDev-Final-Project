const api = path => `/api${path}`;

function $id(id){return document.getElementById(id)}

async function fetchContacts(q=''){
  const url = api(`/contacts${q?`?search=${encodeURIComponent(q)}`:''}`);
  const res = await fetch(url);
  return res.json();
}

function render(contacts){
  const list = $id('contacts');
  list.innerHTML = '';
  contacts.forEach(c=>{
    const li = document.createElement('li'); li.className='contact';
    const img = document.createElement('img'); img.src = c.icon || 'https://via.placeholder.com/48?text=?';
    const meta = document.createElement('div'); meta.className='meta';
    meta.innerHTML = `<strong>${c.name||''}</strong><div>${c.email||''} ${c.phone?`· ${c.phone}`:''}</div>`;
    const actions = document.createElement('div'); actions.className='actions';
    const edit = document.createElement('button'); edit.textContent='Edit';
    edit.onclick = ()=> openForm(c);
    const del = document.createElement('button'); del.textContent='Delete';
    del.onclick = async ()=>{ if(!confirm('Delete?')) return; await fetch(api(`/contacts/${c.id}`),{method:'DELETE'}); load(); };
    actions.append(edit,del);
    li.append(img,meta,actions);
    list.appendChild(li);
  });
}

async function load(q=''){ const contacts = await fetchContacts(q); render(contacts); }

function openForm(contact){
  $id('formWrap').classList.remove('hidden');
  $id('contactId').value = contact?.id || '';
  $id('name').value = contact?.name || '';
  $id('email').value = contact?.email || '';
  $id('phone').value = contact?.phone || '';
  $id('notes').value = contact?.notes || '';
}

function closeForm(){ $id('formWrap').classList.add('hidden'); $id('contactForm').reset(); $id('contactId').value=''; }

document.addEventListener('DOMContentLoaded', ()=>{
  $id('newBtn').addEventListener('click', ()=>openForm());
  $id('cancel').addEventListener('click', ()=>closeForm());
  $id('search').addEventListener('input', e=> load(e.target.value));

  $id('contactForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const id = $id('contactId').value;
    const fd = new FormData();
    fd.append('name', $id('name').value);
    fd.append('email', $id('email').value);
    fd.append('phone', $id('phone').value);
    fd.append('notes', $id('notes').value);
    const file = $id('icon').files[0]; if(file) fd.append('icon', file);
    if(id){
      await fetch(api(`/contacts/${id}`),{method:'PUT',body:fd});
    } else {
      await fetch(api('/contacts'),{method:'POST',body:fd});
    }
    closeForm(); load();
  });

  load();
});
