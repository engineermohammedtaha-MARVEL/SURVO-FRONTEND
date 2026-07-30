function showPage(name){
  if(name !== 'chat' && typeof stopChatPolling === 'function') stopChatPolling();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.getElementById('content').scrollTop = 0;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('on'));
  var navMap = {home:'home', requesthub:'requesthub', request:'requesthub', jobs:'requesthub', myequip:'myequip', protection:'protection', inquiry:'protection', report:'protection', profile:'profile'};
  var navName = navMap[name];
  if(navName){
    var el = document.querySelector('.nav-item[data-nav="'+navName+'"]');
    if(el) el.classList.add('on');
  }
  var isAuthScreen = (name === 'register' || name === 'login' || name === 'forgot-password' || name === 'reset-password');
  var nav = document.querySelector('.bottomnav');
  var header = document.querySelector('.app-header');
  if(nav) nav.style.display = isAuthScreen ? 'none' : '';
  if(header) header.style.display = isAuthScreen ? 'none' : '';
  if(name === 'forgot-password' || name === 'reset-password'){
    var stepEmail = document.getElementById('forgot-step-email');
    var stepSent = document.getElementById('forgot-step-sent');
    if(stepEmail) stepEmail.style.display = '';
    if(stepSent) stepSent.style.display = 'none';
    var emailInput = document.getElementById('forgot-email-input');
    if(emailInput) emailInput.value = '';
  }
}
async function sendResetLink(){
  var emailInput = document.getElementById('forgot-email-input');
  var email = emailInput ? emailInput.value.trim() : '';
  if(!email){
    showToast('من فضلك اكتب البريد الإلكتروني');
    return;
  }
  try{
    await apiRequest('/auth/forgot-password', { method:'POST', body: JSON.stringify({ email: email }) });
    document.getElementById('forgot-step-email').style.display = 'none';
    document.getElementById('forgot-step-sent').style.display = '';
  }catch(err){
    showToast(err.message || 'حصل خطأ أثناء إرسال الرابط');
  }
}

async function submitResetPassword(){
  var pass = (document.getElementById('resetNewPasswordInput')||{}).value || '';
  var confirm = (document.getElementById('resetNewPasswordConfirmInput')||{}).value || '';
  if(pass.length < 6){
    showToast('كلمة المرور لازم تكون 6 أحرف على الأقل');
    return;
  }
  if(pass !== confirm){
    showToast('كلمة المرور وتأكيدها مش متطابقين');
    return;
  }
  var token = window.__resetToken;
  if(!token){
    showToast('رابط غير صالح');
    return;
  }
  try{
    await apiRequest('/auth/reset-password', { method:'POST', body: JSON.stringify({ token: token, password: pass }) });
    showToast('تم تغيير كلمة المرور بنجاح ✓');
    setTimeout(function(){ showPage('login'); }, 1000);
  }catch(err){
    showToast(err.message || 'حصل خطأ أثناء تغيير كلمة المرور');
  }
}
var toastTimer;
function showToast(msg){
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 1600);
}
// Apply correct header/nav visibility for whichever page is active on load
(function(){
  var active = document.querySelector('.page.active');
  if(active){
    var isAuthScreen = (active.id === 'page-register' || active.id === 'page-login' || active.id === 'page-forgot-password' || active.id === 'page-reset-password');
    var nav = document.querySelector('.bottomnav');
    var header = document.querySelector('.app-header');
    if(nav) nav.style.display = isAuthScreen ? 'none' : '';
    if(header) header.style.display = isAuthScreen ? 'none' : '';
  }
})();
var currentCategoryFilter = 'all';
var currentLocationFilter = 'all';
function filterListings(cat, chipEl){
  document.querySelectorAll('#page-home .chip').forEach(function(c){ c.classList.remove('on'); });
  chipEl.classList.add('on');
  currentCategoryFilter = cat;
  if(typeof loadHomeEquipment === 'function') loadHomeEquipment();
}
function filterByLocation(loc){
  currentLocationFilter = loc;
  if(typeof loadHomeEquipment === 'function') loadHomeEquipment();
}

var workTypeOptionsByJob = {
  engineer: [{key:'full', label:'شهري'}, {key:'remote', label:'عن بُعد'}],
  surveyor: [{key:'full', label:'شهري'}, {key:'daily', label:'يومي'}],
  assistant: [{key:'full', label:'شهري'}, {key:'daily', label:'يومي'}],
  totalstation: [{key:'full', label:'شهري'}, {key:'daily', label:'يومي'}],
  gps: [{key:'full', label:'شهري'}, {key:'daily', label:'يومي'}],
  level: [{key:'full', label:'شهري'}, {key:'daily', label:'يومي'}]
};
function addSpecialtyFromInput(inputId, wrapId){
  var input = document.getElementById(inputId || 'newSpecialtyInput');
  var value = input.value.trim();
  if(!value) return;
  var wrap = document.getElementById(wrapId || 'specialtyTags');
  var tag = document.createElement('span');
  tag.className = 'tag';
  tag.style.cursor = 'pointer';
  tag.textContent = value + ' ✕';
  tag.setAttribute('onclick', 'removeSpecialtyTag(this)');
  wrap.appendChild(tag);
  input.value = '';
}
function handleSpecialtyKeydown(evt, inputId, wrapId){
  if(evt.key !== 'Enter') return;
  evt.preventDefault();
  addSpecialtyFromInput(inputId, wrapId);
}
function removeSpecialtyTag(el){
  el.remove();
}
function selectAccountType(el){
  document.querySelectorAll('.account-type-card').forEach(function(c){
    var on = c === el;
    c.classList.toggle('on', on);
    var icon = c.querySelector('.acc-type-icon');
    var label = c.querySelector('.acc-type-label');
    if(icon) icon.style.color = on ? '' : 'var(--ink-faint)';
    if(label) label.style.color = on ? '' : 'var(--ink-soft)';
  });
  var type = el.getAttribute('data-accounttype');
  var unionRow = document.getElementById('unionCardRow');
  if(unionRow) unionRow.style.display = (type === 'engineer') ? '' : 'none';

  var commercialRow = document.getElementById('commercialRecordRow');
  if(commercialRow) commercialRow.style.display = (type === 'office') ? '' : 'none';

  var qualificationRow = document.getElementById('qualificationRow');
  if(qualificationRow) qualificationRow.style.display = (type === 'surveyor_unverified' || type === 'general' || type === 'assistant' || type === 'office') ? 'none' : '';

  var isOffice = (type === 'office');
  var nameLabel = document.getElementById('fullNameLabel');
  var nameInput = document.getElementById('fullNameInput');
  if(nameLabel) nameLabel.textContent = isOffice ? 'اسم المكتب / الشركة' : 'الاسم بالكامل';
  if(nameInput) nameInput.placeholder = isOffice ? 'مثال: مكتب الدقة للمساحة' : 'مثال: أحمد محمد السيد';
}
function selectJobType(type){
  document.querySelectorAll('.job-type-card').forEach(function(c){
    var on = c.getAttribute('data-jobtype') === type;
    c.classList.toggle('on', on);
    var icon = c.querySelector('div');
    var label = c.querySelectorAll('div')[1];
    if(icon) icon.style.color = on ? '' : 'var(--ink-faint)';
    if(label) label.style.color = on ? '' : 'var(--ink-soft)';
  });
  var wrap = document.getElementById('workTypeOptions');
  var opts = workTypeOptionsByJob[type];
  wrap.innerHTML = opts.map(function(o, i){
    return '<div class="card worktype-card' + (i===0 ? ' on' : '') + '" data-worktype="' + o.key + '" onclick="selectWorkType(this)" style="text-align:center; padding:10px 4px; cursor:pointer;"><div style="font-size:11.5px; font-weight:700;' + (i===0 ? '' : ' color:var(--ink-soft);') + '">' + o.label + '</div></div>';
  }).join('');
}
function selectWorkType(el){
  var wrap = document.getElementById('workTypeOptions');
  wrap.querySelectorAll('.worktype-card').forEach(function(c){
    var on = c === el;
    c.classList.toggle('on', on);
    var label = c.querySelector('div');
    if(label) label.style.color = on ? '' : 'var(--ink-soft)';
  });
}
function selectListingType(el){
  var wrap = document.getElementById('addequipTypeToggle');
  wrap.querySelectorAll('button').forEach(function(b){
    var on = b === el;
    b.classList.toggle('btn-primary', on);
  });
  var isRent = el.getAttribute('data-listingtype') === 'rent';
  var priceLabel = document.getElementById('addEquipPriceLabel');
  if(priceLabel) priceLabel.textContent = isRent ? 'السعر (ج / يوم)' : 'سعر البيع (ج)';
}
function selectRequestType(el){
  var wrap = document.getElementById('requestTypeToggle');
  wrap.querySelectorAll('button').forEach(function(b){
    var on = b === el;
    b.classList.toggle('btn-primary', on);
  });
  var dateFields = document.getElementById('requestDateFields');
  var isRent = el.getAttribute('data-requesttype') === 'rent';
  if(dateFields) dateFields.style.display = isRent ? '' : 'none';
}
function initRequestDateLimits(){
  var todayIso = new Date().toISOString().slice(0,10);
  var fromInput = document.getElementById('requestDateFrom');
  var toInput = document.getElementById('requestDateTo');
  if(fromInput){
    fromInput.min = todayIso;
    fromInput.addEventListener('change', function(){
      var minTo = fromInput.value || todayIso;
      if(toInput){
        toInput.min = minTo;
        if(toInput.value && toInput.value < minTo) toInput.value = minTo;
      }
    });
  }
  if(toInput){ toInput.min = todayIso; }
}
initRequestDateLimits();

async function publishRequest(){
  var typeBtn = document.querySelector('#requestTypeToggle button.btn-primary');
  var isRent = !typeBtn || typeBtn.getAttribute('data-requesttype') === 'rent';
  var deviceSelect = document.getElementById('requestDeviceType');
  var deviceKey = deviceSelect ? deviceSelect.value : 'totalstation';
  var gov = document.getElementById('requestGovernorate');
  var govValue = gov ? gov.value : 'القاهرة';
  var fromInput = document.getElementById('requestDateFrom');
  var toInput = document.getElementById('requestDateTo');
  var detailsInput = document.getElementById('requestDetails');
  var budgetInput = document.getElementById('requestBudget');

  var payload = {
    category: deviceKey,
    type: isRent ? 'rent' : 'buy',
    details: detailsInput ? detailsInput.value : undefined,
    dateFrom: isRent && fromInput ? fromInput.value || undefined : undefined,
    dateTo: isRent && toInput ? toInput.value || undefined : undefined,
    governorate: govValue,
    budget: budgetInput ? budgetInput.value : undefined,
  };

  var isEditing = typeof editingRequestId !== 'undefined' && !!editingRequestId;

  if(typeof getAuthToken === 'function' && getAuthToken()){
    try{
      if(isEditing){
        await updateRequestAPI(editingRequestId, payload);
      }else{
        await publishRequestAPI(payload);
      }
    }catch(err){
      showToast(err.message || 'حصل خطأ أثناء حفظ الطلب على السيرفر');
      return;
    }
  }

  if(isEditing && typeof listingDetailCache !== 'undefined') delete listingDetailCache['request:' + editingRequestId];
  showToast(isEditing ? 'تم حفظ التعديلات ✓' : 'تم نشر طلبك بنجاح ✓');
  editingRequestId = null;
  showPage('home');
  if (typeof loadHomeEquipment === 'function') loadHomeEquipment();
}
var sellersData = {
  deqa: { name:'مكتب الدقة للمساحة', initials:'مد', subtitle:'مكتب أجهزة مساحية', rating:'4.8', reviews:'32', response:'٪97', verified:true, phone:'201001234567', tags:['تأجير أجهزة','بيع أجهزة','صيانة'], bio:'مكتب متخصص في تأجير وبيع الأجهزة المساحية بخبرة تزيد عن 10 سنين في السوق المصري.' },
  giza: { name:'مكتب الجيزة للمساحة', initials:'جي', subtitle:'مكتب أجهزة مساحية', rating:'4.3', reviews:'19', response:'٪89', verified:true, phone:'201009876543', tags:['تأجير أجهزة','تدريب فني'], bio:'مكتب مساحة بيقدم خدمات تأجير وتدريب على الأجهزة الحديثة.' },
  sahel: { name:'مكتب الساحل للمساحة', initials:'مس', subtitle:'مكتب أجهزة مساحية', rating:'4.6', reviews:'14', response:'٪93', verified:true, phone:'201112223344', tags:['ليزر سكانر','مسح ثلاثي الأبعاد'], bio:'متخصصين في أجهزة المسح الليزري ثلاثي الأبعاد وخدمات ما بعد البيع.' },
  osama: { name:'مهندس أسامة كمال', initials:'أس', subtitle:'مهندس مساحة مستقل', rating:'4.6', reviews:'21', response:'٪96', verified:true, phone:'201223344556', tags:['مساحة أراضي','GPS'], bio:'مهندس مساحة مستقل بخبرة 9 سنين في أعمال المساحة الأرضية والرفع بالـ GPS.' },
  marvel: { name:'مارفل للأعمال المساحية', initials:'مع', subtitle:'شركة أجهزة مساحية', rating:'4.7', reviews:'27', response:'٪94', verified:true, phone:'201556677889', tags:['تأجير أجهزة','خدمات ميدانية'], bio:'شركة متخصصة في توفير الأجهزة المساحية للمشروعات الكبرى.' }
};
function openPublicProfile(key){
  var d = sellersData[key];
  if(!d) return;
  document.getElementById('pubAvatar').textContent = d.initials;
  document.getElementById('pubName').textContent = d.name;
  document.getElementById('pubSubtitle').textContent = d.subtitle;
  document.getElementById('pubVerifiedBadge').style.display = d.verified ? '' : 'none';
  document.getElementById('pubRating').textContent = d.rating;
  document.getElementById('pubReviews').textContent = d.reviews;
  document.getElementById('pubResponse').textContent = d.response;
  document.getElementById('pubBio').textContent = d.bio;
  document.getElementById('pubTags').innerHTML = d.tags.map(function(t){ return '<span class="tag">'+t+'</span>'; }).join('');
  document.getElementById('pubChatBtn').setAttribute('onclick', "openChat('"+d.name+"','"+d.initials+"')");
  document.getElementById('pubCallBtn').setAttribute('onclick', "callSeller('"+d.phone+"')");
  showPage('pubprofile');
}
function callSeller(phone){
  window.location.href = 'tel:+' + phone;
}
function clearLoginFields(){
  var emailInput = document.getElementById('loginEmailInput');
  var passInput = document.getElementById('loginPasswordInput');
  if(emailInput) emailInput.value = '';
  if(passInput) passInput.value = '';
}
function logoutUser(){
  if(!confirm('متأكد إنك عايز تسجّل الخروج؟')) return;
  if(typeof clearAuthToken === 'function') clearAuthToken();
  if(typeof stopNotificationPolling === 'function') stopNotificationPolling();
  if(typeof resetReportForm === 'function') resetReportForm();
  if(typeof resetInquiryForm === 'function') resetInquiryForm();
  if(typeof editingRequestId !== 'undefined') editingRequestId = null;
  clearLoginFields();
  showPage('login');
  showToast('تم تسجيل الخروج');
}

// لو الابليكيشن اتساب في الخلفية (أو اتقفل) لمدة تعدّي الحد ده، نطلب تسجيل دخول جديد
var AWAY_LOGOUT_THRESHOLD_MS = 10 * 60 * 1000;
var AWAY_LAST_ACTIVE_KEY = 'survo_last_active_ts';

function markAppActiveNow(){
  try { localStorage.setItem(AWAY_LAST_ACTIVE_KEY, String(Date.now())); } catch(e){}
}

function forceLogoutIfAwayTooLong(){
  var lastActive = 0;
  try { lastActive = Number(localStorage.getItem(AWAY_LAST_ACTIVE_KEY) || 0); } catch(e){}
  if(!lastActive) return;
  var awayMs = Date.now() - lastActive;
  if(awayMs > AWAY_LOGOUT_THRESHOLD_MS && typeof getAuthToken === 'function' && getAuthToken()){
    if(typeof clearAuthToken === 'function') clearAuthToken();
    if(typeof stopNotificationPolling === 'function') stopNotificationPolling();
    if(typeof resetReportForm === 'function') resetReportForm();
    if(typeof resetInquiryForm === 'function') resetInquiryForm();
    clearLoginFields();
    showPage('login');
  }
}

document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'hidden'){
    markAppActiveNow();
  }else if(document.visibilityState === 'visible'){
    forceLogoutIfAwayTooLong();
    markAppActiveNow();
  }
});
forceLogoutIfAwayTooLong();
function openChat(name, initials){
  if(typeof currentConversationId !== 'undefined') currentConversationId = null;
  if(typeof currentChatOtherUserId !== 'undefined') currentChatOtherUserId = null;
  document.getElementById('chatRecipientName').textContent = name;
  document.getElementById('chatAvatar').textContent = initials || name.trim().slice(0,2);
  var wrap = document.getElementById('chatMessages');
  if(wrap) wrap.innerHTML = '<div class="msg in">أهلاً بيك، إزاي أقدر أساعدك؟<span class="msg-time">10:02 ص</span></div>';
  showPage('chat');
}
async function sendChatMessage(){
  var box = document.getElementById('chatInputBox');
  var text = box.value.trim();
  if(!text) return;

  if(typeof currentChatOtherUserId !== 'undefined' && currentChatOtherUserId && typeof apiRequest === 'function'){
    box.value = '';
    try{
      // أول رسالة فعلية هي اللي بتنشئ المحادثة الحقيقية، مش مجرد فتح شاشة الشات
      if(!currentConversationId){
        var convData = await apiRequest('/chat/conversations', {
          method: 'POST',
          body: JSON.stringify({ userId: currentChatOtherUserId }),
        });
        currentConversationId = convData.conversation.id;
        if(typeof startChatPolling === 'function') startChatPolling(currentConversationId);
      }
      await apiRequest('/chat/conversations/' + currentConversationId + '/messages', {
        method: 'POST',
        body: JSON.stringify({ body: text }),
      });
      await loadChatMessages(currentConversationId);
    }catch(err){
      showToast(err.message || 'تعذر إرسال الرسالة');
    }
    return;
  }

  var wrap = document.getElementById('chatMessages');
  var now = new Date();
  var h = now.getHours(); var m = now.getMinutes();
  var ampm = h >= 12 ? 'م' : 'ص';
  var h12 = h % 12; if(h12 === 0) h12 = 12;
  var timeStr = h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  var div = document.createElement('div');
  div.className = 'msg out';
  div.innerHTML = text.replace(/</g,'&lt;') + '<span class="msg-time">' + timeStr + '</span>';
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  box.value = '';
}
