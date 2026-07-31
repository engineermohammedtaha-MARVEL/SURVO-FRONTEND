// ============================================================
// SURVO API integration layer
// يربط الواجهة (index.html) بالباك اند الحقيقي (survo-backend)
// ============================================================

const API_BASE_URL = 'https://survo-production.up.railway.app/api';

// أي نص جاي من مستخدم (عنوان إعلان، وصف، اسم، إلخ) لازم يعدي من هنا قبل ما يتحط
// في innerHTML، عشان نمنع حقن HTML/script من مستخدم لمستخدم تاني (stored XSS)
function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

// ---------- تخزين التوكن ----------
function getAuthToken() {
  return localStorage.getItem('survo_token');
}
function setAuthToken(token) {
  if (token) localStorage.setItem('survo_token', token);
}
function clearAuthToken() {
  localStorage.removeItem('survo_token');
  localStorage.removeItem('survo_user');
}
function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('survo_user') || 'null');
  } catch (e) {
    return null;
  }
}
function setCurrentUser(user) {
  localStorage.setItem('survo_user', JSON.stringify(user));
}

// ---------- fetch wrapper ----------
async function apiRequest(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  const token = getAuthToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  let res;
  try {
    res = await fetch(API_BASE_URL + path, Object.assign({}, options, { headers }));
  } catch (networkErr) {
    throw new Error('تعذر الاتصال بالسيرفر. تأكد إن الباك اند شغال والرابط صحيح.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // لا يوجد جسم JSON (مثلاً استجابة فارغة)
  }

  if (!res.ok) {
    const message = (data && data.message) || 'حصل خطأ غير متوقع';
    // لو التوكن اللي بعتناه بقى غير صالح (اتلغى بعد تغيير الباسورد، أو الحساب اترفض)، نرجّع المستخدم لصفحة الدخول
    // بدل ما نسيبه يشوف نفس رسالة الخطأ دي في كل حركة يعملها
    if (res.status === 401 && token) {
      if (typeof clearAuthToken === 'function') clearAuthToken();
      if (typeof stopNotificationPolling === 'function') stopNotificationPolling();
      if (typeof showPage === 'function') showPage('login');
    }
    throw new Error(message);
  }
  return data;
}

// ============================================================
// USER PROFILE RENDERING
// ============================================================

const ACCOUNT_TYPE_LABELS = {
  engineer: 'مهندس مساحة',
  specialist: 'أخصائي مساحة',
  surveyor_academic: 'مساح عام أكاديمي',
  surveyor_professional: 'مساح مهني',
  assistant: 'مساعد مساح',
  office: 'مكتب / شركة',
  general: 'تسجيل عام',
};

function renderUserProfile(user) {
  if (!user) return;

  var homeNameEl = document.getElementById('homeUserName');
  if (homeNameEl) homeNameEl.textContent = user.fullName;

  var avatarEl = document.getElementById('profileAvatarDisplay');
  if (avatarEl) {
    var avatarInput = avatarEl.querySelector('input[type=file]');
    if (user.avatarUrl) {
      avatarEl.style.backgroundImage = 'url(' + user.avatarUrl + ')';
      avatarEl.textContent = '';
    } else {
      avatarEl.style.backgroundImage = '';
      avatarEl.textContent = '📷';
    }
    if (avatarInput) avatarEl.appendChild(avatarInput);
  }

  var profileNameEl = document.getElementById('profileName');
  if (profileNameEl) profileNameEl.textContent = user.fullName;

  var typeEl = document.getElementById('profileAccountType');
  if (typeEl) typeEl.textContent = ACCOUNT_TYPE_LABELS[user.accountType] || user.accountType;

  var verifiedBadge = document.getElementById('profileVerifiedBadge');
  if (verifiedBadge) {
    const isVerified = user.verification === 'verified';
    verifiedBadge.style.display = isVerified ? '' : 'none';
    verifiedBadge.textContent = (user.accountType === 'engineer' ? '🛡 موثّق نقابيًا' : '🛡 موثّق');
  }

  var ratingEl = document.getElementById('profileRatingStat');
  if (ratingEl) ratingEl.textContent = Number(user.rating || 0).toFixed(1);

  var reviewsEl = document.getElementById('profileReviewsStat');
  if (reviewsEl) reviewsEl.textContent = user.ratingCount || 0;

  var responseEl = document.getElementById('profileResponseStat');
  if (responseEl) responseEl.textContent = (user.responseRate === null || user.responseRate === undefined) ? '—' : ('٪' + user.responseRate);

  var specEl = document.getElementById('profileSpecialties');
  if (specEl) {
    specEl.innerHTML = (user.specialties && user.specialties.length)
      ? user.specialties.map(function (s) { return '<span class="tag">' + escapeHtml(s) + '</span>'; }).join('')
      : '<span class="tag" style="color:var(--ink-faint);">لسه مفيش تخصصات مضافة</span>';
  }

  var bioEl = document.getElementById('profileBio');
  if (bioEl) bioEl.textContent = user.bio || 'لسه مفيش نبذة مكتوبة.';
}

async function handleProfileAvatarSelect(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const avatarEl = document.getElementById('profileAvatarDisplay');
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', 'avatar');
    const res = await fetch(API_BASE_URL + '/uploads', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + getAuthToken() },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل رفع الصورة');

    const updated = await apiRequest('/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ avatarUrl: data.url }),
    });
    setCurrentUser(updated.user);
    renderUserProfile(updated.user);
    showToast('تم تحديث صورة البروفايل ✓');
  } catch (err) {
    showToast(err.message || 'تعذر رفع الصورة');
  }
}

async function refreshCurrentUser() {
  if (!getAuthToken()) return null;
  try {
    const data = await apiRequest('/auth/me');
    setCurrentUser(data.user);
    renderUserProfile(data.user);
    return data.user;
  } catch (err) {
    return getCurrentUser();
  }
}

// ============================================================
// AUTH
// ============================================================

var registrationDocUrls = {};
var registerAvatarUrl = null;

async function handleRegisterAvatarSelect(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const preview = document.getElementById('registerAvatarPreview');
  const label = preview ? preview.firstChild : null;
  if (label) label.textContent = '…';

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', 'avatar');
    const res = await fetch(API_BASE_URL + '/uploads/registration', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل رفع الصورة');

    registerAvatarUrl = data.url;
    if (preview) {
      preview.style.backgroundImage = 'url(' + data.url + ')';
      if (label) label.textContent = '';
    }
  } catch (err) {
    if (label) label.textContent = '📷';
    showToast(err.message || 'تعذر رفع الصورة');
  }
}

async function handleRegistrationDocSelect(input, key, statusId) {
  const file = input.files && input.files[0];
  if (!file) return;

  const statusEl = document.getElementById(statusId);
  if (statusEl) statusEl.textContent = '…';

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', 'doc');
    const res = await fetch(API_BASE_URL + '/uploads/registration', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل رفع الملف');

    registrationDocUrls[key] = data.url;
    if (statusEl) statusEl.textContent = '✓';
  } catch (err) {
    if (statusEl) statusEl.textContent = '⬆';
    showToast(err.message || 'تعذر رفع الملف');
  }
}

async function registerUser() {
  const nameLabel = document.getElementById('fullNameLabel');
  const isOffice = nameLabel && nameLabel.textContent.trim() === 'اسم المكتب / الشركة';

  const fullName = (document.getElementById('fullNameInput') || {}).value || '';
  const email = (document.getElementById('registerEmailInput') || {}).value || '';
  const password = (document.getElementById('registerPasswordInput') || {}).value || '';
  const confirm = (document.getElementById('registerPasswordConfirmInput') || {}).value || '';
  const phone = (document.getElementById('registerPhoneInput') || {}).value || '';
  const governorate = (document.getElementById('registerGovernorateInput') || {}).value || '';
  const bio = (document.getElementById('registerBioInput') || {}).value || '';

  const selectedType = document.querySelector('.account-type-card.on');
  const accountType = selectedType ? selectedType.getAttribute('data-accounttype') : 'general';

  const specialtyTags = Array.from(document.querySelectorAll('#registerSpecialtyTags .tag'))
    .map(function (el) { return el.textContent.replace('✕', '').trim(); });

  if (!fullName.trim()) {
    showToast(isOffice ? 'من فضلك اكتب اسم المكتب / الشركة' : 'من فضلك اكتب الاسم بالكامل');
    return;
  }
  if (!phone.trim()) {
    showToast('من فضلك اكتب رقم الهاتف');
    return;
  }
  if (password.length < 6) {
    showToast('كلمة المرور لازم تكون 6 أحرف على الأقل');
    return;
  }
  if (password !== confirm) {
    showToast('كلمة المرور وتأكيدها مش متطابقين');
    return;
  }

  try {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        password,
        accountType,
        governorate,
        bio: bio.trim() || undefined,
        specialties: specialtyTags.length ? specialtyTags : undefined,
        nationalIdUrl: registrationDocUrls.nationalIdUrl,
        personalPhotoUrl: registrationDocUrls.personalPhotoUrl,
        qualificationUrl: registrationDocUrls.qualificationUrl,
        unionCardUrl: registrationDocUrls.unionCardUrl,
        commercialRecordUrl: registrationDocUrls.commercialRecordUrl,
        avatarUrl: registerAvatarUrl || undefined,
      }),
    });

    registrationDocUrls = {};
    registerAvatarUrl = null;
    showToast(data.message || 'تم إنشاء حسابك، وهيتم تفعيله بعد موافقة الإدارة');
    setTimeout(function () { showPage('login'); }, 1200);
  } catch (err) {
    showToast(err.message || 'حصل خطأ أثناء إنشاء الحساب');
  }
}

async function loginUser() {
  const phoneOrEmail = (document.getElementById('loginEmailInput') || {}).value || '';
  const password = (document.getElementById('loginPasswordInput') || {}).value || '';

  if (!phoneOrEmail.trim() || !password) {
    showToast('اكتب رقم الهاتف وكلمة المرور');
    return;
  }

  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone: phoneOrEmail.trim(), password }),
    });
    setAuthToken(data.token);
    setCurrentUser(data.user);
    renderUserProfile(data.user);
    refreshCurrentUser();
    startNotificationPolling();
    showToast('تم تسجيل الدخول ✓');
    setTimeout(function () { showPage('home'); }, 500);
  } catch (err) {
    showToast(err.message || 'رقم الهاتف أو كلمة المرور غلط');
  }
}

function openEditProfile() {
  const user = getCurrentUser();
  if (user) {
    const nameInput = document.getElementById('editProfileName');
    const phoneInput = document.getElementById('editProfilePhone');
    const emailInput = document.getElementById('editProfileEmail');
    const govSelect = document.getElementById('editProfileGovernorate');
    const bioInput = document.getElementById('editProfileBio');
    const tagsWrap = document.getElementById('specialtyTags');

    if (nameInput) nameInput.value = user.fullName || '';
    if (phoneInput) phoneInput.value = user.phone || '';
    if (emailInput) emailInput.value = user.email || '';
    if (govSelect && user.governorate) govSelect.value = user.governorate;
    if (bioInput) bioInput.value = user.bio || '';
    if (tagsWrap) {
      tagsWrap.innerHTML = (user.specialties || []).map(function (s) {
        return '<span class="tag" onclick="removeSpecialtyTag(this)" style="cursor:pointer;">' + escapeHtml(s) + ' ✕</span>';
      }).join('');
    }
  }
  showPage('editprofile');
}

async function saveProfileEdits() {
  const nameInput = document.getElementById('editProfileName');
  const govSelect = document.getElementById('editProfileGovernorate');
  const bioInput = document.getElementById('editProfileBio');
  const specialtyTags = Array.from(document.querySelectorAll('#specialtyTags .tag'))
    .map(function (el) { return el.textContent.replace('✕', '').trim(); });

  try {
    const data = await apiRequest('/users/me', {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: nameInput ? nameInput.value.trim() : undefined,
        governorate: govSelect ? govSelect.value : undefined,
        bio: bioInput ? bioInput.value.trim() : undefined,
        specialties: specialtyTags,
      }),
    });
    setCurrentUser(data.user);
    renderUserProfile(data.user);
    showToast('تم حفظ التعديلات ✓');
    setTimeout(function () { showPage('profile'); }, 700);
  } catch (err) {
    showToast(err.message || 'حصل خطأ أثناء حفظ التعديلات');
  }
}

// ============================================================
// EQUIPMENT (الأجهزة) - عرض في الصفحة الرئيسية
// ============================================================

const CATEGORY_LABELS = {
  totalstation: 'توتال ستاشن',
  gps: 'GPS',
  level: 'ميزان',
  laser: 'ليزر سكانر',
  accessories: 'اكسسوارات',
};

// كاش بيانات المستخدمين الجزئية اللي بتظهر جوه كروت الإعلانات/الطلبات/الوظائف/المحادثات/التقييمات،
// عشان فتح البروفايل العام يبقى فوري من غير أي استنى شبكة (نفس فكرة كاش تفاصيل الإعلان)
var publicProfileCache = {};
function cachePartialProfile(user) {
  if (!user || !user.id) return;
  publicProfileCache[user.id] = Object.assign({}, publicProfileCache[user.id] || {}, user);
}

function equipmentCardHTML(item) {
  const isRent = item.listingType === 'rent';
  const price = isRent
    ? (item.pricePerDay ? Number(item.pricePerDay).toLocaleString('ar-EG') + ' ج / يوم' : 'السعر عند الطلب')
    : (item.salePrice ? Number(item.salePrice).toLocaleString('ar-EG') + ' ج' : 'السعر عند الطلب');
  const badgeClass = isRent ? 'badge-rent' : 'badge-sale';
  const badgeLabel = isRent ? 'للإيجار' : 'للبيع';
  const thumb = item.images && item.images[0]
    ? '<div class="item-thumb" style="background-image:url(' + escapeHtml(item.images[0]) + '); background-size:cover; background-position:center;"></div>'
    : '<div class="item-thumb" style="background:var(--cream-2); display:flex; align-items:center; justify-content:center; font-size:26px;">🛠️</div>';

  const owner = item.owner || {};
  cachePartialProfile(owner);
  const currentUser = getCurrentUser();
  const isOwnListing = currentUser && owner.id === currentUser.id;
  const clickHandler = isOwnListing
    ? "showToast('ده إعلانك انت')"
    : "openEquipmentDetail('" + item.id + "')";

  return (
    '<div class="item-card card" data-cat="' + escapeHtml(item.category) + '" onclick="' + clickHandler + '">' +
    thumb +
    '<span class="badge ' + badgeClass + '">' + badgeLabel + '</span>' +
    '<div class="item-name">' + escapeHtml(item.title || CATEGORY_LABELS[item.category] || 'جهاز مساحة') + '</div>' +
    '<div class="item-loc">📍 ' + escapeHtml(item.governorate || '—') + '</div>' +
    '<div class="item-price">' + price + '</div>' +
    '</div>'
  );
}

function fillListingDetailContact(person) {
  cachePartialProfile(person);
  const initials = (person.fullName || 'م ص').trim().slice(0, 2);
  document.getElementById('equipDetailOwnerAvatar').textContent = initials;
  document.getElementById('equipDetailOwnerName').textContent = person.fullName || 'مستخدم';
  document.getElementById('equipDetailOwnerRating').textContent = Number(person.rating || 0).toFixed(1);

  const verifiedBadge = document.getElementById('equipDetailOwnerVerified');
  verifiedBadge.style.display = person.verification === 'verified' ? '' : 'none';

  // بنستخدم .onclick بدل بناء نص كود جافاسكريبت (setAttribute) عشان أي بيانات
  // جاية من المستخدم (زي الاسم أو رقم الموبايل) ما تقدرش تكسر أو تحقن كود
  const ownerRow = document.getElementById('equipDetailOwnerRow');
  ownerRow.onclick = function () { openRealPublicProfile(person.id); };

  const msgBtn = document.getElementById('equipDetailMsgBtn');
  msgBtn.onclick = function () { openChatWithUser(person.id); };

  const callBtn = document.getElementById('equipDetailCallBtn');
  callBtn.onclick = function () { callSeller(person.phone || ''); };
}

async function openEquipmentDetail(itemId) {
  return openListingDetail('equipment', itemId);
}

// كاش بسيط بالإعلانات اللي ظهرت في الصفحة الرئيسية، عشان فتح تفاصيل الإعلان
// يبقى فوري من غير أي استنى شبكة — بيانات الكارت أصلاً فيها كل حاجة تقريبًا
var listingDetailCache = {};
function cacheListingDetail(type, item) {
  if (!item || !item.id) return;
  listingDetailCache[type + ':' + item.id] = item;
}

var currentDetailType = null;
var currentDetailId = null;

function renderListingDetail(type, item) {
  const thumbEl = document.getElementById('equipDetailThumb');
  const badgeEl = document.getElementById('equipDetailBadge');
  thumbEl.style.backgroundImage = '';
  thumbEl.textContent = '';

  currentDetailType = type;
  currentDetailId = item.id;

  if (type === 'equipment') {
    const isRent = item.listingType === 'rent';
    if (item.images && item.images[0]) {
      thumbEl.style.backgroundImage = 'url(' + item.images[0] + ')';
    } else {
      thumbEl.textContent = '🛠️';
    }
    badgeEl.textContent = isRent ? 'للإيجار' : 'للبيع';
    badgeEl.className = 'badge ' + (isRent ? 'badge-rent' : 'badge-sale');
    document.getElementById('equipDetailTitle').textContent = item.title || CATEGORY_LABELS[item.category] || 'جهاز مساحة';
    document.getElementById('equipDetailLocation').textContent = '📍 ' + (item.governorate || '—');
    const price = isRent
      ? (item.pricePerDay ? formatMoney(item.pricePerDay, ' ج / يوم') : 'السعر عند الطلب')
      : (item.salePrice ? formatMoney(item.salePrice, ' ج') : 'السعر عند الطلب');
    document.getElementById('equipDetailPrice').textContent = price;
    document.getElementById('equipDetailDesc').textContent = item.description || 'لا يوجد وصف';
    fillListingDetailContact(item.owner || {});
    toggleListingOwnRow(false);
  } else if (type === 'job') {
    thumbEl.textContent = '💼';
    badgeEl.textContent = 'وظيفة';
    badgeEl.className = 'badge';
    document.getElementById('equipDetailTitle').textContent = item.title;
    document.getElementById('equipDetailLocation').textContent = '📍 ' + (item.governorate || '—');
    document.getElementById('equipDetailPrice').textContent = item.salary
      ? formatMoney(item.salary, ' ج')
      : (WORK_TYPE_LABELS[item.workType] || JOB_TYPE_LABELS[item.jobType] || '—');
    document.getElementById('equipDetailDesc').textContent = item.description || 'لا يوجد وصف';
    fillListingDetailContact(item.poster || {});
    toggleListingOwnRow(false);
  } else {
    thumbEl.textContent = '📨';
    badgeEl.textContent = 'طلب';
    badgeEl.className = 'badge';
    document.getElementById('equipDetailTitle').textContent = 'طلب: ' + (CATEGORY_LABELS[item.category] || item.category) + (item.brand ? ' — ' + item.brand : '');
    document.getElementById('equipDetailLocation').textContent = '📍 ' + (item.governorate || '—');
    let priceText = item.type === 'rent' ? 'إيجار' : 'شراء';
    if (item.type === 'rent' && item.dateFrom && item.dateTo) {
      priceText += ' — ' + new Date(item.dateFrom).toLocaleDateString('ar-EG') + ' إلى ' + new Date(item.dateTo).toLocaleDateString('ar-EG');
    }
    if (item.budget) {
      priceText += ' — ' + formatMoney(item.budget, ' ج');
    }
    document.getElementById('equipDetailPrice').textContent = priceText;
    document.getElementById('equipDetailDesc').textContent = item.details || 'لا يوجد تفاصيل إضافية';
    const requester = item.requester || {};
    const currentUser = getCurrentUser();
    const isOwnRequest = !!(currentUser && requester.id && requester.id === currentUser.id);
    fillListingDetailContact(requester);
    toggleListingOwnRow(isOwnRequest);
  }
}

function toggleListingOwnRow(isOwn) {
  const contactRow = document.getElementById('equipDetailContactRow');
  const ownRow = document.getElementById('equipDetailOwnRow');
  if (contactRow) contactRow.style.display = isOwn ? 'none' : '';
  if (ownRow) ownRow.style.display = isOwn ? '' : 'none';
}

async function deleteMyRequest() {
  if (currentDetailType !== 'request' || !currentDetailId) return;
  if (!confirm('متأكد إنك عايز تحذف الطلب ده؟')) return;
  try {
    await apiRequest('/requests/' + currentDetailId, { method: 'DELETE' });
    showToast('تم حذف الطلب ✓');
    delete listingDetailCache['request:' + currentDetailId];
    closeListingDetail();
  } catch (err) {
    showToast(err.message || 'تعذر حذف الطلب');
  }
}

// ============================================================
// MY REQUESTS (page-myrequests) — عرض/تعديل/حذف طلبات المستخدم نفسه
// ============================================================

var editingRequestId = null;

function toggleRequestBrandField() {
  const category = document.getElementById('requestDeviceType');
  const wrap = document.getElementById('requestBrandFieldWrap');
  if (!category || !wrap) return;
  wrap.style.display = category.value === 'accessories' ? 'none' : '';
}

function resetRequestForm() {
  const typeToggle = document.getElementById('requestTypeToggle');
  if (typeToggle) {
    typeToggle.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('btn-primary', b.getAttribute('data-requesttype') === 'rent');
    });
  }
  const dateFields = document.getElementById('requestDateFields');
  if (dateFields) dateFields.style.display = '';
  const deviceType = document.getElementById('requestDeviceType');
  if (deviceType) deviceType.value = 'totalstation';
  const brand = document.getElementById('requestBrand');
  if (brand) brand.value = '';
  const brandOther = document.getElementById('requestBrandOtherInput');
  if (brandOther) { brandOther.value = ''; brandOther.style.display = 'none'; }
  toggleRequestBrandField();
  const details = document.getElementById('requestDetails');
  if (details) details.value = '';
  const dateFrom = document.getElementById('requestDateFrom');
  if (dateFrom) dateFrom.value = '';
  const dateTo = document.getElementById('requestDateTo');
  if (dateTo) dateTo.value = '';
  const governorate = document.getElementById('requestGovernorate');
  if (governorate) governorate.value = 'القاهرة';
  const budget = document.getElementById('requestBudget');
  if (budget) budget.value = '';
}

function startNewRequest() {
  editingRequestId = null;
  resetRequestForm();
  const title = document.getElementById('requestPageTitle');
  if (title) title.textContent = 'حدد طلبك';
  const submitBtn = document.getElementById('requestSubmitBtn');
  if (submitBtn) submitBtn.textContent = 'نشر الطلب';
  showPage('request');
}

function editMyRequest() {
  if (currentDetailType !== 'request' || !currentDetailId) return;
  const item = listingDetailCache['request:' + currentDetailId];
  if (!item) return;

  editingRequestId = currentDetailId;

  const typeToggle = document.getElementById('requestTypeToggle');
  if (typeToggle) {
    typeToggle.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('btn-primary', b.getAttribute('data-requesttype') === item.type);
    });
  }
  const isRent = item.type === 'rent';
  const dateFields = document.getElementById('requestDateFields');
  if (dateFields) dateFields.style.display = isRent ? '' : 'none';

  const deviceType = document.getElementById('requestDeviceType');
  if (deviceType) deviceType.value = item.category || 'totalstation';
  toggleRequestBrandField();
  const brandSelect = document.getElementById('requestBrand');
  const brandOtherInput = document.getElementById('requestBrandOtherInput');
  const brand = item.brand || '';
  const knownBrands = brandSelect
    ? Array.prototype.map.call(brandSelect.options, function (o) { return o.value; }).filter(function (v) { return v && v !== 'other'; })
    : [];
  if (!brand) {
    if (brandSelect) brandSelect.value = '';
    if (brandOtherInput) { brandOtherInput.style.display = 'none'; brandOtherInput.value = ''; }
  } else if (knownBrands.indexOf(brand) !== -1) {
    if (brandSelect) brandSelect.value = brand;
    if (brandOtherInput) { brandOtherInput.style.display = 'none'; brandOtherInput.value = ''; }
  } else {
    if (brandSelect) brandSelect.value = 'other';
    if (brandOtherInput) { brandOtherInput.style.display = ''; brandOtherInput.value = brand; }
  }
  const details = document.getElementById('requestDetails');
  if (details) details.value = item.details || '';
  const dateFrom = document.getElementById('requestDateFrom');
  if (dateFrom) dateFrom.value = item.dateFrom ? item.dateFrom.slice(0, 10) : '';
  const dateTo = document.getElementById('requestDateTo');
  if (dateTo) dateTo.value = item.dateTo ? item.dateTo.slice(0, 10) : '';
  const governorate = document.getElementById('requestGovernorate');
  if (governorate) governorate.value = item.governorate || 'القاهرة';
  const budget = document.getElementById('requestBudget');
  if (budget) budget.value = item.budget || '';

  const title = document.getElementById('requestPageTitle');
  if (title) title.textContent = 'تعديل الطلب';
  const submitBtn = document.getElementById('requestSubmitBtn');
  if (submitBtn) submitBtn.textContent = 'حفظ التعديلات';

  showPage('request');
}

function myRequestRowHTML(item) {
  const typeLabel = item.type === 'rent' ? 'إيجار' : 'شراء';
  let priceText = typeLabel;
  if (item.type === 'rent' && item.dateFrom && item.dateTo) {
    priceText += ' — ' + new Date(item.dateFrom).toLocaleDateString('ar-EG') + ' إلى ' + new Date(item.dateTo).toLocaleDateString('ar-EG');
  }
  if (item.budget) {
    priceText += ' — ' + formatMoney(item.budget, ' ج');
  }
  return (
    '<div class="list-row" style="cursor:pointer;" onclick="openListingDetail(\'request\', \'' + item.id + '\')">' +
    '<span style="font-size:18px;">📨</span>' +
    '<div style="flex:1;"><div style="font-size:12.5px; font-weight:700; color:var(--navy);">طلب: ' + escapeHtml(CATEGORY_LABELS[item.category] || item.category) + (item.brand ? ' — ' + escapeHtml(item.brand) : '') + '</div>' +
    '<div style="font-size:10.5px; color:var(--ink-soft);">' + escapeHtml(priceText) + '</div></div>' +
    '<span style="color:var(--ink-faint);">←</span>' +
    '</div>'
  );
}

async function loadMyRequests() {
  const listEl = document.getElementById('myRequestsList');
  if (!listEl) return;
  try {
    const data = await apiRequest('/requests/mine');
    const items = (data && data.items) || [];
    items.forEach(function (item) { cacheListingDetail('request', item); });
    listEl.innerHTML = items.length
      ? items.map(myRequestRowHTML).join('')
      : '<div class="subtitle" style="text-align:center; margin-top:16px;">لسه معملتش أي طلبات، دوس "اطلب جهاز مساحة" عشان تضيف أول طلب</div>';
  } catch (err) {
    listEl.innerHTML = '<div class="subtitle" style="text-align:center; margin-top:16px;">تعذر تحميل طلباتك: ' + (err.message || '') + '</div>';
  }
}

var detailReturnPage = 'home';

function refreshReturnPage(page) {
  if (page === 'myrequests') loadMyRequests();
  else if (page === 'myequip') loadMyEquipment();
  else loadHomeEquipment();
}

function closeListingDetail() {
  const page = detailReturnPage || 'home';
  showPage(page);
  refreshReturnPage(page);
}

async function openListingDetail(type, itemId) {
  if (!itemId) return;
  const activePage = document.querySelector('.page.active');
  if (activePage) detailReturnPage = activePage.id.replace('page-', '');
  showPage('equipment-detail');

  // بنسجل مشاهدة للجهاز عشان صاحب الإعلان يعرف كام واحد شاف إعلانه — السيرفر
  // بيتجاهل مشاهدة المالك نفسه لإعلانه، فمش محتاجين نتأكد من ده هنا
  if (type === 'equipment') {
    apiRequest('/equipment/' + itemId + '/view', { method: 'POST' }).catch(function () { /* مش حاجة توقف عرض التفاصيل */ });
  }

  const pageTitle = document.getElementById('equipDetailPageTitle');
  if (pageTitle) pageTitle.textContent = type === 'job' ? 'تفاصيل الوظيفة' : type === 'request' ? 'تفاصيل الطلب' : 'تفاصيل الجهاز';

  const endpoint = type === 'equipment' ? '/equipment/' : type === 'job' ? '/jobs/' : '/requests/';
  const errorText = type === 'equipment' ? 'تعذر تحميل تفاصيل الجهاز' : type === 'job' ? 'تعذر تحميل تفاصيل الوظيفة' : 'تعذر تحميل تفاصيل الطلب';
  const cached = listingDetailCache[type + ':' + itemId];

  if (cached) {
    // عندنا البيانات فعلاً من الصفحة الرئيسية — نعرضها فورًا من غير أي لودينج
    renderListingDetail(type, cached);
    // وبعدين نحدّثها بهدوء في الخلفية من غير ما نوري أي مؤشر تحميل
    apiRequest(endpoint + itemId).then(function (data) {
      cacheListingDetail(type, data.item);
      renderListingDetail(type, data.item);
    }).catch(function () { /* عندنا نسخة شغالة من الكاش، مفيش داعي نزعج المستخدم */ });
    return;
  }

  document.getElementById('equipDetailTitle').textContent = 'بتحمّل...';
  document.getElementById('equipDetailThumb').style.backgroundImage = '';
  document.getElementById('equipDetailThumb').textContent = '';

  try {
    const data = await apiRequest(endpoint + itemId);
    cacheListingDetail(type, data.item);
    renderListingDetail(type, data.item);
  } catch (err) {
    document.getElementById('equipDetailTitle').textContent = errorText;
    showToast(err.message || errorText);
  }
}

const JOB_TYPE_LABELS = {
  engineer: 'مهندس مساحة',
  surveyor: 'مساح',
  assistant: 'مساعد',
  totalstation: 'فريق توتال ستاشن',
  gps: 'فريق GPS',
  level: 'فريق ميزان',
};
const WORK_TYPE_LABELS = { full: 'شهري', daily: 'يومي', remote: 'عن بُعد' };

function formatMoney(value, suffix) {
  const num = Number(value);
  if (value === null || value === undefined || value === '' || !isFinite(num)) return String(value || '');
  return num.toLocaleString('ar-EG') + (suffix || '');
}

function requestCardHTML(item) {
  cachePartialProfile(item.requester);
  const typeLabel = item.type === 'rent' ? 'إيجار' : 'شراء';
  const clickHandler = "openListingDetail('request', '" + item.id + "')";

  let priceText = typeLabel;
  if (item.type === 'rent' && item.dateFrom && item.dateTo) {
    priceText += ' — ' + new Date(item.dateFrom).toLocaleDateString('ar-EG') + ' إلى ' + new Date(item.dateTo).toLocaleDateString('ar-EG');
  }
  if (item.budget) {
    priceText += ' — ' + formatMoney(item.budget, ' ج');
  }

  return (
    '<div class="item-card card" data-cat="' + escapeHtml(item.category) + '" onclick="' + clickHandler + '">' +
    '<div class="item-thumb" style="background:var(--cream-2); display:flex; align-items:center; justify-content:center; font-size:26px;">📨</div>' +
    '<span class="badge" style="background:#E9EEF7; color:var(--navy-3);">طلب</span>' +
    '<div class="item-name">طلب: ' + escapeHtml(CATEGORY_LABELS[item.category] || item.category) + (item.brand ? ' — ' + escapeHtml(item.brand) : '') + '</div>' +
    '<div class="item-loc">📍 ' + escapeHtml(item.governorate || '—') + '</div>' +
    '<div class="item-price" style="font-size:11.5px;">' + escapeHtml(priceText) + '</div>' +
    '</div>'
  );
}

function jobCardHTML(item) {
  const currentUser = getCurrentUser();
  const poster = item.poster || {};
  cachePartialProfile(poster);
  const isOwn = currentUser && poster.id === currentUser.id;
  const clickHandler = isOwn
    ? "showToast('ده إعلانك انت')"
    : "openListingDetail('job', '" + item.id + "')";

  return (
    '<div class="item-card card" data-cat="jobs" onclick="' + clickHandler + '">' +
    '<div class="item-thumb" style="background:var(--cream-2); display:flex; align-items:center; justify-content:center; font-size:26px;">💼</div>' +
    '<span class="badge" style="background:#E9F7EF; color:var(--green);">وظيفة</span>' +
    '<div class="item-name">' + escapeHtml(item.title) + '</div>' +
    '<div class="item-loc">📍 ' + escapeHtml(item.governorate || '—') + '</div>' +
    '<div class="item-price" style="font-size:11.5px;">' + escapeHtml(item.salary ? formatMoney(item.salary, ' ج') : (WORK_TYPE_LABELS[item.workType] || JOB_TYPE_LABELS[item.jobType] || '')) + '</div>' +
    '</div>'
  );
}

function buildQuery(params) {
  const qs = Object.keys(params)
    .filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ''; })
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  return qs ? '?' + qs : '';
}

function updateHomeSectionLabel(cat, loc) {
  const label = document.getElementById('homeSectionLabel');
  if (!label) return;
  const catText = (cat === 'jobs') ? 'الوظائف' : (CATEGORY_LABELS[cat] || 'قريب منك');
  const locText = (loc && loc !== 'all') ? loc : 'كل المحافظات';
  label.textContent = catText + ' — ' + locText;
}

async function loadHomeEquipment() {
  const grid = document.getElementById('homeListingsGrid');
  if (!grid) return;

  const cat = (typeof currentCategoryFilter !== 'undefined') ? currentCategoryFilter : 'all';
  const loc = (typeof currentLocationFilter !== 'undefined') ? currentLocationFilter : 'all';
  updateHomeSectionLabel(cat, loc);

  const isDeviceCategory = cat !== 'all' && cat !== 'jobs';
  const showEquipmentAndRequests = cat !== 'jobs';
  const showJobs = cat === 'all' || cat === 'jobs';
  const governorate = loc !== 'all' ? loc : undefined;
  const category = isDeviceCategory ? cat : undefined;

  try {
    const [equipRes, requestsRes, jobsRes] = await Promise.allSettled([
      showEquipmentAndRequests ? apiRequest('/equipment' + buildQuery({ pageSize: 20, category: category, governorate: governorate })) : Promise.resolve({ items: [] }),
      showEquipmentAndRequests ? apiRequest('/requests' + buildQuery({ category: category, governorate: governorate })) : Promise.resolve({ items: [] }),
      showJobs ? apiRequest('/jobs' + buildQuery({ governorate: governorate })) : Promise.resolve({ items: [] }),
    ]);

    const equipment = (equipRes.status === 'fulfilled' && equipRes.value.items || []).map(function (item) {
      return { _type: 'equipment', createdAt: item.createdAt, item: item };
    });
    const requests = (requestsRes.status === 'fulfilled' && requestsRes.value.items || []).map(function (item) {
      return { _type: 'request', createdAt: item.createdAt, item: item };
    });
    const jobs = (jobsRes.status === 'fulfilled' && jobsRes.value.items || []).map(function (item) {
      return { _type: 'job', createdAt: item.createdAt, item: item };
    });

    const merged = equipment.concat(requests, jobs).sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    if (!merged.length) {
      grid.innerHTML = '<div class="subtitle" style="text-align:center; grid-column: 1 / -1; padding:20px 0;">مفيش إعلانات مطابقة دلوقتي</div>';
      return;
    }

    merged.forEach(function (entry) { cacheListingDetail(entry._type, entry.item); });

    grid.innerHTML = merged.map(function (entry) {
      if (entry._type === 'equipment') return equipmentCardHTML(entry.item);
      if (entry._type === 'request') return requestCardHTML(entry.item);
      return jobCardHTML(entry.item);
    }).join('');
  } catch (err) {
    grid.innerHTML = '<div class="subtitle" style="text-align:center; grid-column: 1 / -1; padding:20px 0;">تعذر تحميل الإعلانات، تأكد من الاتصال بالإنترنت</div>';
    console.warn('تعذر تحميل الإعلانات من السيرفر:', err.message);
  }
}

// ============================================================
// MY EQUIPMENT (page-myequip) - عرض/حذف أجهزتي
// ============================================================

const CATEGORY_ICONS = {
  totalstation: '▦',
  gps: '◈',
  laser: '◫',
  level: '═',
  accessories: '◆',
};

function myEquipRowHTML(item) {
  const icon = CATEGORY_ICONS[item.category] || '▦';
  const priceText = item.listingType === 'rent'
    ? (item.pricePerDay ? Number(item.pricePerDay).toLocaleString('ar-EG') + ' ج / يوم' : 'إيجار — السعر عند الطلب')
    : (item.salePrice ? Number(item.salePrice).toLocaleString('ar-EG') + ' ج' : 'للبيع — السعر عند الطلب');
  const statusBadge = item.available
    ? '<span class="badge badge-verified">متاح</span>'
    : '<span class="badge" style="background:#FCEFDD; color:var(--amber-dark);">غير متاح</span>';

  const moderationBadge = item.moderationStatus === 'pending'
    ? '<span class="badge" style="background:#FFF3D6; color:#a06a00;">قيد المراجعة</span>'
    : item.moderationStatus === 'rejected'
      ? '<span class="badge" style="background:#FDE3E3; color:#b3261e;">مرفوض</span>'
      : '';

  const viewsText = '👁 ' + (Number(item.viewsCount) || 0).toLocaleString('ar-EG') + ' مشاهدة';

  return (
    '<div class="list-row" data-equip-id="' + item.id + '">' +
    '<span>' + icon + '</span>' +
    '<div style="flex:1;"><div style="font-size:12.5px; font-weight:700; color:var(--navy);">' + escapeHtml(item.title || CATEGORY_LABELS[item.category] || 'جهاز مساحة') + '</div>' +
    '<div style="font-size:10.5px; color:var(--ink-soft);">' + escapeHtml(priceText) + ' — ' + viewsText + '</div></div>' +
    moderationBadge +
    statusBadge +
    '<span class="delete-ico" style="margin-left:2px;" onclick="editMyEquipment(\'' + item.id + '\')">✏️</span>' +
    '<span class="delete-ico" onclick="deleteMyEquipment(\'' + item.id + '\')">🗑</span>' +
    '</div>'
  );
}

async function loadMyEquipment() {
  const listEl = document.getElementById('myEquipList');
  if (!listEl) return;
  try {
    const data = await apiRequest('/equipment/mine');
    const items = (data && data.items) || [];
    items.forEach(function (item) { cacheListingDetail('equipment', item); });

    const totalEl = document.getElementById('myEquipStatTotal');
    const availEl = document.getElementById('myEquipStatAvailable');
    const otherEl = document.getElementById('myEquipStatOther');
    const availableCount = items.filter(function (i) { return i.available; }).length;
    if (totalEl) totalEl.textContent = items.length;
    if (availEl) availEl.textContent = availableCount;
    if (otherEl) otherEl.textContent = items.length - availableCount;

    listEl.innerHTML = items.length
      ? items.map(myEquipRowHTML).join('')
      : '<div class="subtitle" style="text-align:center; margin-top:16px;">لسه معندكش أجهزة معروضة، دوس + عشان تضيف أول جهاز</div>';
  } catch (err) {
    listEl.innerHTML = '<div class="subtitle" style="text-align:center; margin-top:16px;">تعذر تحميل أجهزتك: ' + (err.message || '') + '</div>';
  }
}

async function deleteMyEquipment(id) {
  if (!confirm('متأكد إنك عايز تحذف الإعلان ده؟')) return;
  try {
    await apiRequest('/equipment/' + id, { method: 'DELETE' });
    showToast('تم حذف الإعلان ✓');
    loadMyEquipment();
  } catch (err) {
    showToast(err.message || 'تعذر حذف الإعلان');
  }
}

var editingEquipmentId = null;

function startNewEquipment() {
  editingEquipmentId = null;
  resetAddEquipPhotos();

  const category = document.getElementById('addEquipCategory');
  if (category) category.value = 'totalstation';
  const brand = document.getElementById('addEquipBrand');
  if (brand) brand.value = '';
  const brandOther = document.getElementById('addEquipBrandOtherInput');
  if (brandOther) { brandOther.value = ''; brandOther.style.display = 'none'; }
  const model = document.getElementById('addEquipModel');
  if (model) model.value = '';
  const price = document.getElementById('addEquipPrice');
  if (price) price.value = '';
  const governorate = document.getElementById('addEquipGovernorate');
  if (governorate) governorate.value = 'القاهرة';
  const description = document.getElementById('addEquipDescription');
  if (description) description.value = '';

  const typeToggle = document.getElementById('addequipTypeToggle');
  if (typeToggle) {
    typeToggle.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('btn-primary', b.getAttribute('data-listingtype') === 'rent');
    });
  }
  const priceLabel = document.getElementById('addEquipPriceLabel');
  if (priceLabel) priceLabel.textContent = 'السعر (ج / يوم)';

  const title = document.getElementById('addEquipPageTitle');
  if (title) title.textContent = 'إضافة إعلان جديد';
  const submitBtn = document.getElementById('addEquipSubmitBtn');
  if (submitBtn) submitBtn.textContent = 'إضافة الجهاز';

  showPage('addequip');
}

function editMyEquipment(id) {
  const item = listingDetailCache['equipment:' + id];
  if (!item) return;
  editingEquipmentId = id;

  const typeToggle = document.getElementById('addequipTypeToggle');
  if (typeToggle) {
    typeToggle.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('btn-primary', b.getAttribute('data-listingtype') === item.listingType);
    });
  }
  const priceLabel = document.getElementById('addEquipPriceLabel');
  if (priceLabel) priceLabel.textContent = item.listingType === 'rent' ? 'السعر (ج / يوم)' : 'سعر البيع (ج)';

  const category = document.getElementById('addEquipCategory');
  if (category) category.value = item.category || 'totalstation';

  // مفيش برند/موديل متخزنين لوحدهم في الداتابيز، بس عنوان الإعلان — فبنحاول نفصلهم عن بعض
  // بمطابقة أول كلمة في العنوان مع قائمة البراندات المعروفة
  const brandSelect = document.getElementById('addEquipBrand');
  const brandOtherInput = document.getElementById('addEquipBrandOtherInput');
  const modelInput = document.getElementById('addEquipModel');
  const title = item.title || '';
  const knownBrands = brandSelect
    ? Array.prototype.map.call(brandSelect.options, function (o) { return o.value; }).filter(function (v) { return v && v !== 'other'; })
    : [];
  const matchedBrand = knownBrands.find(function (b) { return title.toLowerCase().indexOf(b.toLowerCase()) === 0; });
  if (matchedBrand) {
    if (brandSelect) brandSelect.value = matchedBrand;
    if (brandOtherInput) { brandOtherInput.style.display = 'none'; brandOtherInput.value = ''; }
    if (modelInput) modelInput.value = title.slice(matchedBrand.length).trim();
  } else {
    if (brandSelect) brandSelect.value = 'other';
    if (brandOtherInput) { brandOtherInput.style.display = ''; brandOtherInput.value = title; }
    if (modelInput) modelInput.value = '';
  }

  const priceInput = document.getElementById('addEquipPrice');
  if (priceInput) priceInput.value = item.listingType === 'rent' ? (item.pricePerDay || '') : (item.salePrice || '');

  const governorate = document.getElementById('addEquipGovernorate');
  if (governorate) governorate.value = item.governorate || 'القاهرة';

  const description = document.getElementById('addEquipDescription');
  if (description) description.value = item.description || '';

  // بنحمّل الصور والمستندات الحالية في الكاش، فلو المستخدم مرفعش حاجة جديدة
  // القيم دي هي اللي هتتبعت زي ما هي من غير ما تتمسح
  const images = item.images || [];
  addEquipPhotoUrls = {};
  if (images[0]) addEquipPhotoUrls[1] = images[0];
  if (images[1]) addEquipPhotoUrls[2] = images[1];
  [1, 2].forEach(function (i) {
    const slot = document.getElementById('addEquipPhotoSlot' + i);
    if (slot) {
      if (images[i - 1]) {
        slot.style.backgroundImage = 'url(' + images[i - 1] + ')';
        slot.firstChild.textContent = '';
      } else {
        slot.style.backgroundImage = '';
        slot.firstChild.textContent = '📷 صورة ' + i;
      }
      const input = slot.querySelector('input[type=file]');
      if (input) input.value = '';
    }
  });

  equipDocUrls = {};
  if (item.ownershipDocUrl) equipDocUrls.ownershipDocUrl = item.ownershipDocUrl;
  if (item.serialNumberPhotoUrl) equipDocUrls.serialNumberPhotoUrl = item.serialNumberPhotoUrl;
  const ownershipStatus = document.getElementById('ownershipDocStatus');
  if (ownershipStatus) ownershipStatus.textContent = item.ownershipDocUrl ? '✓' : '⬆';
  const serialStatus = document.getElementById('serialPhotoStatus');
  if (serialStatus) serialStatus.textContent = item.serialNumberPhotoUrl ? '✓' : '⬆';

  const serialInput = document.getElementById('addEquipSerialNumber');
  if (serialInput) serialInput.value = item.serialNumber || '';

  const title2 = document.getElementById('addEquipPageTitle');
  if (title2) title2.textContent = 'تعديل الإعلان';
  const submitBtn = document.getElementById('addEquipSubmitBtn');
  if (submitBtn) submitBtn.textContent = 'حفظ التعديلات';

  showPage('addequip');
}

var addEquipPhotoUrls = {};

async function handleEquipPhotoSelect(input, slotIndex) {
  const file = input.files && input.files[0];
  if (!file) return;

  const slot = document.getElementById('addEquipPhotoSlot' + slotIndex);
  const originalText = slot ? slot.firstChild.textContent : '';
  if (slot) slot.firstChild.textContent = 'بترفع...';

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', 'equipment');
    const res = await fetch(API_BASE_URL + '/uploads', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + getAuthToken() },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل رفع الصورة');

    addEquipPhotoUrls[slotIndex] = data.url;
    if (slot) {
      slot.style.backgroundImage = 'url(' + addEquipPhotoUrls[slotIndex] + ')';
      slot.firstChild.textContent = '';
    }
  } catch (err) {
    if (slot) slot.firstChild.textContent = originalText;
    showToast(err.message || 'تعذر رفع الصورة');
  }
}

function resetAddEquipPhotos() {
  addEquipPhotoUrls = {};
  equipDocUrls = {};
  [1, 2].forEach(function (i) {
    const slot = document.getElementById('addEquipPhotoSlot' + i);
    if (slot) {
      slot.style.backgroundImage = '';
      slot.firstChild.textContent = '📷 صورة ' + i;
      const input = slot.querySelector('input[type=file]');
      if (input) input.value = '';
    }
  });
  ['ownershipDocStatus', 'serialPhotoStatus'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.textContent = '⬆';
  });
  const serialInput = document.getElementById('addEquipSerialNumber');
  if (serialInput) serialInput.value = '';
}

var equipDocUrls = {};

async function handleEquipDocSelect(input, key, statusId) {
  const file = input.files && input.files[0];
  if (!file) return;

  const statusEl = document.getElementById(statusId);
  if (statusEl) statusEl.textContent = '…';

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', 'equipment-doc');
    const res = await fetch(API_BASE_URL + '/uploads', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + getAuthToken() },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل رفع الملف');

    equipDocUrls[key] = data.url;
    if (statusEl) statusEl.textContent = '✓';
  } catch (err) {
    if (statusEl) statusEl.textContent = '⬆';
    showToast(err.message || 'تعذر رفع الملف');
  }
}

async function submitAddEquipment() {
  const typeBtn = document.querySelector('#addequipTypeToggle button.btn-primary');
  const listingType = typeBtn ? typeBtn.getAttribute('data-listingtype') : 'rent';

  const category = (document.getElementById('addEquipCategory') || {}).value || 'totalstation';
  const brand = getBrandFieldValue('addEquipBrand', 'addEquipBrandOtherInput');
  const model = (document.getElementById('addEquipModel') || {}).value || '';
  const priceInput = document.getElementById('addEquipPrice');
  const price = priceInput ? priceInput.value : '';
  const governorate = (document.getElementById('addEquipGovernorate') || {}).value || '';
  const description = (document.getElementById('addEquipDescription') || {}).value || '';

  const title = (brand.trim() + ' ' + model.trim()).trim();
  if (!title) {
    showToast('اكتب ماركة الجهاز أو الموديل على الأقل');
    return;
  }

  const serialNumberInput = document.getElementById('addEquipSerialNumber');

  const payload = {
    title,
    category,
    listingType,
    description: description.trim() || undefined,
    governorate,
    images: Object.values(addEquipPhotoUrls),
    serialNumber: serialNumberInput ? serialNumberInput.value.trim() || undefined : undefined,
    ownershipDocUrl: equipDocUrls.ownershipDocUrl,
    serialNumberPhotoUrl: equipDocUrls.serialNumberPhotoUrl,
  };
  if (listingType === 'rent') payload.pricePerDay = price || undefined;
  else payload.salePrice = price || undefined;

  const isEdit = !!editingEquipmentId;
  const editedId = editingEquipmentId;

  try {
    const data = isEdit
      ? await apiRequest('/equipment/' + editedId, { method: 'PATCH', body: JSON.stringify(payload) })
      : await apiRequest('/equipment', { method: 'POST', body: JSON.stringify(payload) });
    showToast(data.message || (isEdit ? 'تم حفظ التعديلات ✓' : 'تم إضافة الجهاز ✓'));
    if (isEdit) delete listingDetailCache['equipment:' + editedId];
    editingEquipmentId = null;
    resetAddEquipPhotos();
    setTimeout(function () { showPage('myequip'); loadMyEquipment(); }, 900);
  } catch (err) {
    showToast(err.message || (isEdit ? 'حصل خطأ أثناء حفظ التعديلات' : 'حصل خطأ أثناء إضافة الجهاز'));
  }
}

var supportAttachmentUrl = null;

async function handleSupportAttachmentSelect(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const statusEl = document.getElementById('supportAttachmentStatus');
  if (statusEl) statusEl.textContent = '…';

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', 'support');
    const res = await fetch(API_BASE_URL + '/uploads', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + getAuthToken() },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل رفع الصورة');

    supportAttachmentUrl = data.url;
    if (statusEl) statusEl.textContent = '✓';
  } catch (err) {
    if (statusEl) statusEl.textContent = '⬆';
    showToast(err.message || 'تعذر رفع الصورة');
  }
}

const DEVICE_CATEGORY_LABELS = {
  totalstation: 'توتال ستاشن',
  gps: 'GPS',
  level: 'ميزان',
  laser: 'ليزر سكانر',
  accessories: 'اكسسوارات',
};

var reportDocUrls = {};

function selectReportStatus(el) {
  const wrap = document.getElementById('reportStatusToggle');
  wrap.querySelectorAll('button').forEach(function (b) { b.classList.toggle('btn-primary', b === el); });
}

async function handleReportDocSelect(input, key, statusId) {
  const file = input.files && input.files[0];
  if (!file) return;

  const statusEl = document.getElementById(statusId);
  if (statusEl) statusEl.textContent = '…';

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', 'report-doc');
    const res = await fetch(API_BASE_URL + '/uploads', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + getAuthToken() },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل رفع الملف');

    reportDocUrls[key] = data.url;
    if (statusEl) statusEl.textContent = '✓';
  } catch (err) {
    if (statusEl) statusEl.textContent = '⬆';
    showToast(err.message || 'تعذر رفع الملف');
  }
}

// خانة الماركة بقت select بقيمة "other" بديل عن كتابة حرة، عشان نضمن عدم وجود خطأ كتابي
function toggleBrandOtherInput(selectId, otherId) {
  const select = document.getElementById(selectId);
  const otherInput = document.getElementById(otherId);
  if (!select || !otherInput) return;
  const isOther = select.value === 'other';
  otherInput.style.display = isOther ? '' : 'none';
  if (!isOther) otherInput.value = '';
}

function getBrandFieldValue(selectId, otherId) {
  const select = document.getElementById(selectId);
  const otherInput = document.getElementById(otherId);
  if (!select) return '';
  if (select.value === 'other') return otherInput ? otherInput.value.trim() : '';
  return select.value;
}

function resetReportForm() {
  const category = document.getElementById('reportCategory');
  const brand = document.getElementById('reportBrand');
  const brandOther = document.getElementById('reportBrandOtherInput');
  const serialNumber = document.getElementById('reportSerialNumber');
  const details = document.getElementById('reportDetails');
  const contactPhone = document.getElementById('reportContactPhone');
  if (category) category.value = 'totalstation';
  if (brand) brand.value = '';
  if (brandOther) { brandOther.value = ''; brandOther.style.display = 'none'; }
  if (serialNumber) serialNumber.value = '';
  if (details) details.value = '';
  if (contactPhone) contactPhone.value = '';

  const statusWrap = document.getElementById('reportStatusToggle');
  if (statusWrap) {
    statusWrap.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('btn-primary', b.getAttribute('data-status') === 'stolen');
    });
  }

  reportDocUrls = {};
  const policeStatus = document.getElementById('reportPoliceDocStatus');
  const ownershipStatus = document.getElementById('reportOwnershipDocStatus');
  if (policeStatus) policeStatus.textContent = '⬆';
  if (ownershipStatus) ownershipStatus.textContent = '⬆';
}

function resetInquiryForm() {
  const category = document.getElementById('inquiryCategory');
  const brand = document.getElementById('inquiryBrandInput');
  const brandOther = document.getElementById('inquiryBrandOtherInput');
  const serialNumber = document.getElementById('inquirySerialInput');
  const resultEl = document.getElementById('inquiryResult');
  if (category) category.value = 'totalstation';
  if (brand) brand.value = '';
  if (brandOther) { brandOther.value = ''; brandOther.style.display = 'none'; }
  if (serialNumber) serialNumber.value = '';
  if (resultEl) resultEl.innerHTML = '';
}

async function submitDeviceReport() {
  const category = (document.getElementById('reportCategory') || {}).value || 'totalstation';
  const brand = getBrandFieldValue('reportBrand', 'reportBrandOtherInput');
  const serialNumber = (document.getElementById('reportSerialNumber') || {}).value || '';
  const statusBtn = document.querySelector('#reportStatusToggle button.btn-primary');
  const status = statusBtn ? statusBtn.getAttribute('data-status') : 'stolen';
  const details = (document.getElementById('reportDetails') || {}).value || '';
  const contactPhone = (document.getElementById('reportContactPhone') || {}).value || '';

  if (!brand) {
    showToast('اختار ماركة الجهاز');
    return;
  }
  if (!serialNumber.trim()) {
    showToast('اكتب الرقم التسلسلي للجهاز');
    return;
  }

  try {
    await apiRequest('/device-reports', {
      method: 'POST',
      body: JSON.stringify({
        category,
        brand,
        serialNumber: serialNumber.trim(),
        status,
        details: details.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        policeReportUrl: reportDocUrls.policeReportUrl,
        ownershipDocUrl: reportDocUrls.ownershipDocUrl,
      }),
    });
    showToast('تم إرسال البلاغ ✓ هيتم مراجعته والتأكد منه قريبًا');
    resetReportForm();
    setTimeout(function () { showPage('protection'); }, 1000);
  } catch (err) {
    showToast(err.message || 'حصل خطأ أثناء إرسال البلاغ');
  }
}

async function submitInquiry() {
  const categoryInput = document.getElementById('inquiryCategory');
  const serialInput = document.getElementById('inquirySerialInput');
  const category = categoryInput ? categoryInput.value : 'totalstation';
  const brand = getBrandFieldValue('inquiryBrandInput', 'inquiryBrandOtherInput');
  const serialNumber = serialInput ? serialInput.value.trim() : '';
  const resultEl = document.getElementById('inquiryResult');
  if (!brand) {
    showToast('اختار ماركة الجهاز');
    return;
  }
  if (!serialNumber) {
    showToast('اكتب الرقم التسلسلي');
    return;
  }
  resultEl.innerHTML = '<div class="subtitle" style="text-align:center;">بيتم الاستعلام...</div>';

  try {
    const data = await apiRequest('/device-reports/lookup?serialNumber=' + encodeURIComponent(serialNumber) + '&brand=' + encodeURIComponent(brand) + '&category=' + encodeURIComponent(category));
    if (data.clean) {
      resultEl.innerHTML =
        '<div class="card" style="border:1.5px solid var(--green); background:var(--green-bg); margin-bottom:10px;">' +
        '<div style="display:flex; gap:9px; align-items:flex-start;">' +
        '<span style="font-size:18px;">✅</span>' +
        '<div><div style="font-size:13px; font-weight:700; color:var(--green);">لا توجد بلاغات على هذا الجهاز</div>' +
        '<div style="font-size:11.5px; color:var(--ink-soft); margin-top:4px; line-height:1.7;">مفيش أي بلاغ فقدان أو سرقة مسجّل على الرقم التسلسلي ده حتى الآن.</div></div>' +
        '</div></div>';
    } else {
      const statusLabel = data.status === 'stolen' ? 'مسروق' : 'مفقود';
      resultEl.innerHTML =
        '<div class="card" style="border:1.5px solid var(--rust); background:#FCEAEA; margin-bottom:10px;">' +
        '<div style="display:flex; gap:9px; align-items:flex-start;">' +
        '<span style="font-size:18px;">⚠️</span>' +
        '<div><div style="font-size:13px; font-weight:700; color:var(--rust);">تحذير: الجهاز ده مبلّغ عنه كـ ' + statusLabel + '</div>' +
        '<div style="font-size:11.5px; color:var(--ink-soft); margin-top:4px; line-height:1.7;">' + escapeHtml(DEVICE_CATEGORY_LABELS[data.category] || data.category) + (data.brand ? ' — ' + escapeHtml(data.brand) : '') + '. متنصحش تكمل شراء أو إيجار الجهاز ده.</div></div>' +
        '</div></div>';
    }
  } catch (err) {
    resultEl.innerHTML = '<div class="subtitle" style="text-align:center;">' + (err.message || 'تعذر الاستعلام') + '</div>';
  }
}

async function submitSupportTicket() {
  const typeSelect = document.getElementById('supportTicketType');
  const detailsInput = document.getElementById('supportTicketDetails');
  const details = detailsInput ? detailsInput.value.trim() : '';

  if (!details) {
    showToast('اكتب تفاصيل المشكلة');
    return;
  }

  try {
    await apiRequest('/support/tickets', {
      method: 'POST',
      body: JSON.stringify({
        type: typeSelect ? typeSelect.value : 'استفسار عام',
        details,
        attachmentUrl: supportAttachmentUrl || undefined,
      }),
    });
    showToast('تم إرسال طلبك ✓ هنرد عليك قريب');
    if (detailsInput) detailsInput.value = '';
    supportAttachmentUrl = null;
    const statusEl = document.getElementById('supportAttachmentStatus');
    if (statusEl) statusEl.textContent = '⬆';
    setTimeout(function () { showPage('profile'); }, 1000);
  } catch (err) {
    showToast(err.message || 'حصل خطأ أثناء إرسال طلبك');
  }
}

// ============================================================
// NOTIFICATIONS (page-notifications)
// ============================================================

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch (e) { /* الصوت مش أساسي لعمل التطبيق، تجاهل أي خطأ (مثلاً متصفح مش بيدعمه) */ }
}

var NOTIF_LAST_SEEN_KEY = 'survo_last_seen_notification_id';
var notifPollTimer = null;

async function checkForNewNotifications() {
  if (!getAuthToken()) return;
  try {
    const data = await apiRequest('/support/notifications');
    const notifications = (data && data.notifications) || [];

    const dot = document.getElementById('notifDot');
    if (dot) dot.style.display = notifications.some(function (n) { return !n.readAt; }) ? '' : 'none';

    if (!notifications.length) return;
    const latestId = notifications[0].id;
    const lastSeenId = localStorage.getItem(NOTIF_LAST_SEEN_KEY);
    if (lastSeenId && lastSeenId !== latestId) {
      playNotificationSound();
    }
    localStorage.setItem(NOTIF_LAST_SEEN_KEY, latestId);
  } catch (err) { /* أخطاء الشبكة هنا مش مهمة نزعج بيها المستخدم */ }
}

function startNotificationPolling() {
  if (notifPollTimer) return;
  checkForNewNotifications();
  notifPollTimer = setInterval(checkForNewNotifications, 20000);
}

function stopNotificationPolling() {
  if (notifPollTimer) { clearInterval(notifPollTimer); notifPollTimer = null; }
}

function notificationRowHTML(n) {
  const isRead = !!n.readAt;
  const hasContact = n.contactUser && n.contactUser.id;
  if (hasContact) cachePartialProfile(n.contactUser);
  const contactId = hasContact ? n.contactUser.id : '';
  // بنمرر بس رقم الـ id (UUID آمن) جوه الـ onclick، والاسم بيتجاب من الكاش وقت الفتح
  const rowClickArgs = "'" + n.id + "', '" + contactId + "'";
  const contactBtn = hasContact
    ? '<button class="btn btn-primary" style="flex-shrink:0; font-size:11px; padding:6px 12px;" onclick="event.stopPropagation(); openNotificationTarget(' + rowClickArgs + ')">تواصل معاه</button>'
    : '';
  return (
    '<div class="list-row" style="' + (isRead ? 'opacity:0.6;' : '') + ' cursor:pointer;" onclick="openNotificationTarget(' + rowClickArgs + ')">' +
    '<span>' + (isRead ? '✓' : '🔔') + '</span>' +
    '<div style="flex:1;"><div style="font-size:12.5px; font-weight:700;">' + escapeHtml(n.title) + '</div>' +
    (n.body ? '<div style="font-size:10.5px; color:var(--ink-soft);">' + escapeHtml(n.body) + '</div>' : '') +
    '</div>' + contactBtn +
    '</div>'
  );
}

function openNotificationTarget(notificationId, contactUserId) {
  markNotificationRead(notificationId);
  if (contactUserId) {
    openChatWithUser(contactUserId);
  }
}

async function loadNotifications() {
  const listEl = document.getElementById('notificationsList');
  if (!listEl) return;
  try {
    const data = await apiRequest('/support/notifications');
    const items = (data && data.notifications) || [];
    listEl.innerHTML = items.length
      ? items.map(notificationRowHTML).join('')
      : '<div class="subtitle" style="text-align:center; margin-top:16px;">مفيش إشعارات لسه</div>';
  } catch (err) {
    listEl.innerHTML = '<div class="subtitle" style="text-align:center; margin-top:16px;">تعذر تحميل الإشعارات: ' + (err.message || '') + '</div>';
  }
}

async function markNotificationRead(id, rowEl) {
  try {
    await apiRequest('/support/notifications/' + id + '/read', { method: 'PATCH' });
    if (rowEl) {
      rowEl.style.opacity = '0.6';
      const icon = rowEl.querySelector('span');
      if (icon) icon.textContent = '✓';
    }
  } catch (err) {
    // تجاهل الخطأ، مش لازم نوقف اليوزر بسبب فشل تعليم إشعار كمقروء
  }
}

// ============================================================
// CHAT (page-chat) - محادثة حقيقية مع صاحب الإعلان
// ============================================================

var currentConversationId = null;
var currentChatOtherUserId = null;

var chatPendingAttachmentUrl = null;

async function handleChatAttachmentSelect(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const row = document.getElementById('chatAttachmentPreviewRow');
  const thumb = document.getElementById('chatAttachmentPreviewThumb');
  const status = document.getElementById('chatAttachmentPreviewStatus');
  if (row) row.style.display = 'flex';
  if (status) status.textContent = 'بترفع...';

  // بريفيو فوري من الملف نفسه (من غير ما نستنى السيرفر) عشان المستخدم يطمن إنه اختار الصورة الصح
  const localPreviewUrl = URL.createObjectURL(file);
  if (thumb) thumb.style.backgroundImage = 'url(' + localPreviewUrl + ')';

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', 'chat');
    const res = await fetch(API_BASE_URL + '/uploads', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + getAuthToken() },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل رفع الصورة');

    chatPendingAttachmentUrl = data.url;
    if (status) status.textContent = 'جاهزة للإرسال ✓';
  } catch (err) {
    clearChatAttachment();
    showToast(err.message || 'تعذر رفع الصورة');
  }
}

function clearChatAttachment() {
  chatPendingAttachmentUrl = null;
  const row = document.getElementById('chatAttachmentPreviewRow');
  const thumb = document.getElementById('chatAttachmentPreviewThumb');
  if (row) row.style.display = 'none';
  if (thumb) thumb.style.backgroundImage = '';
  const input = document.querySelector('.chat-input-row input[type=file]');
  if (input) input.value = '';
}

function chatMessageHTML(msg) {
  const me = getCurrentUser();
  const isMine = me && msg.senderId === me.id;
  const d = new Date(msg.createdAt);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'م' : 'ص';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  const timeStr = h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  const safeBody = String(msg.body || '').replace(/</g, '&lt;');
  // مرفق الصورة (لو موجود) محمي (authenticated) في Cloudinary، فمش بنحط رابطه
  // مباشرة — بنعرض مكانه فاضي وبعدين resolveChatAttachments() بتجيب رابط موقّع وتحطه
  const attachmentHtml = msg.attachmentUrl
    ? '<div class="chat-attachment" data-message-id="' + msg.id + '" style="width:160px; height:160px; max-width:100%; border-radius:10px; background:var(--cream-2); background-size:cover; background-position:center; margin-bottom:' + (safeBody ? '6px' : '0') + '; display:flex; align-items:center; justify-content:center; font-size:22px; cursor:pointer;" onclick="openChatAttachmentFullscreen(this)">⏳</div>'
    : '';
  return '<div class="msg ' + (isMine ? 'out' : 'in') + '">' + attachmentHtml + safeBody + '<span class="msg-time">' + timeStr + '</span></div>';
}

// كاش الروابط الموقّعة لمرفقات الشات (بالـ message id) عشان مانطلبش توقيع جديد
// في كل مرة الشات يتحدّث أو يترسم تاني
var chatAttachmentSignedUrlCache = {};

async function resolveChatAttachments(messages) {
  const pending = messages.filter(function (m) { return m.attachmentUrl && !chatAttachmentSignedUrlCache[m.id]; });
  await Promise.all(pending.map(function (m) {
    return apiRequest('/chat/attachments/signed-url?messageId=' + m.id).then(function (data) {
      chatAttachmentSignedUrlCache[m.id] = data.url;
      const el = document.querySelector('.chat-attachment[data-message-id="' + m.id + '"]');
      if (el) { el.style.backgroundImage = 'url(' + data.url + ')'; el.textContent = ''; }
    }).catch(function () { /* لو فشل، تفضل الأيقونة ⏳ ظاهرة بدل ما نكسر باقي المحادثة */ });
  }));
}

function openChatAttachmentFullscreen(el) {
  const messageId = el.getAttribute('data-message-id');
  const url = chatAttachmentSignedUrlCache[messageId];
  if (url) window.open(url, '_blank');
}

var lastLoadedChatSignature = null;

// كاش آخر رسايل اتحملت لكل محادثة، عشان فتح شات اتفتح قبل كده يبقى فوري من غير لودينج
var chatMessagesCache = {};

async function loadChatMessages(conversationId, silent) {
  const wrap = document.getElementById('chatMessages');
  if (!wrap) return;

  const cachedMessages = chatMessagesCache[conversationId];
  if (!silent && cachedMessages) {
    wrap.innerHTML = cachedMessages.length
      ? cachedMessages.map(chatMessageHTML).join('')
      : '<div class="subtitle" style="text-align:center;">ابدأ المحادثة بأول رسالة</div>';
    wrap.scrollTop = wrap.scrollHeight;
    resolveChatAttachments(cachedMessages);
    silent = true; // عندنا نسخة معروضة فورًا، اللي جاي مجرد تحديث هادئ في الخلفية
  } else if (!silent) {
    wrap.innerHTML = '<div class="subtitle" style="text-align:center;">بتحمّل الرسايل...</div>';
  }

  try {
    const data = await apiRequest('/chat/conversations/' + conversationId + '/messages');
    const messages = (data && data.messages) || [];
    chatMessagesCache[conversationId] = messages;
    const signature = messages.length + '|' + (messages.length ? messages[messages.length - 1].id + messages[messages.length - 1].createdAt : '');
    if (silent && signature === lastLoadedChatSignature) return; // مفيش رسايل جديدة، متعملش إعادة رسم
    lastLoadedChatSignature = signature;

    wrap.innerHTML = messages.length
      ? messages.map(chatMessageHTML).join('')
      : '<div class="subtitle" style="text-align:center;">ابدأ المحادثة بأول رسالة</div>';
    wrap.scrollTop = wrap.scrollHeight;
    resolveChatAttachments(messages);
  } catch (err) {
    if (!silent) wrap.innerHTML = '<div class="subtitle" style="text-align:center;">تعذر تحميل الرسايل: ' + (err.message || '') + '</div>';
  }
}

var chatPollTimer = null;
function startChatPolling(conversationId) {
  stopChatPolling();
  if (!conversationId) return;
  chatPollTimer = setInterval(function () {
    loadChatMessages(conversationId, true);
  }, 3000);
}
function stopChatPolling() {
  if (chatPollTimer) { clearInterval(chatPollTimer); chatPollTimer = null; }
  lastLoadedChatSignature = null;
}

function inboxRowHTML(conv) {
  const me = getCurrentUser();
  const other = (me && conv.userAId === me.id) ? conv.userB : conv.userA;
  cachePartialProfile(other);
  const lastMsg = (conv.messages && conv.messages[0]) || null;
  const preview = lastMsg ? lastMsg.body : 'ابدأ المحادثة';
  const initials = (other.fullName || 'م ص').trim().slice(0, 2);

  return (
    '<div class="list-row" style="cursor:pointer;" onclick="openConversationFromInbox(\'' + conv.id + '\', \'' + other.id + '\')">' +
    '<div class="avatar" style="width:34px; height:34px; font-size:12px;">' + escapeHtml(initials) + '</div>' +
    '<div style="flex:1;">' +
    '<div style="font-size:12.5px; font-weight:700; color:var(--navy);">' + escapeHtml(other.fullName || 'مستخدم') + '</div>' +
    '<div style="font-size:10.5px; color:var(--ink-soft); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:220px;">' + escapeHtml(preview) + '</div>' +
    '</div>' +
    '</div>'
  );
}

// كاش آخر قايمة محادثات اتحملت، عشان فتح صفحة الرسايل تاني يبقى فوري من غير لودينج
var inboxCache = null;

function renderInboxList(items) {
  const listEl = document.getElementById('inboxList');
  if (!listEl) return;
  listEl.innerHTML = items.length
    ? items.map(inboxRowHTML).join('')
    : '<div class="subtitle" style="text-align:center; margin-top:16px;">مفيش محادثات لسه — ابدأ من صفحة جهاز في الرئيسية</div>';
}

async function loadInbox() {
  const listEl = document.getElementById('inboxList');
  if (!listEl) return;

  if (inboxCache) {
    renderInboxList(inboxCache);
    apiRequest('/chat/conversations').then(function (data) {
      inboxCache = (data && data.conversations) || [];
      renderInboxList(inboxCache);
    }).catch(function () { /* عندنا نسخة كاش شغالة، مفيش داعي نزعج المستخدم */ });
    return;
  }

  try {
    const data = await apiRequest('/chat/conversations');
    inboxCache = (data && data.conversations) || [];
    renderInboxList(inboxCache);
  } catch (err) {
    listEl.innerHTML = '<div class="subtitle" style="text-align:center; margin-top:16px;">تعذر تحميل المحادثات: ' + (err.message || '') + '</div>';
  }
}

function openConversationFromInbox(conversationId, otherUserId) {
  const cached = publicProfileCache[otherUserId] || {};
  const name = cached.fullName || 'مستخدم';
  currentConversationId = conversationId;
  currentChatOtherUserId = otherUserId;
  document.getElementById('chatRecipientName').textContent = name;
  document.getElementById('chatAvatar').textContent = name.trim().slice(0, 2);
  clearChatAttachment();
  showPage('chat');
  loadChatMessages(conversationId);
  startChatPolling(conversationId);
}

async function openChatWithUser(userId, name, initials) {
  if (!userId) return;
  // بنعتمد على الكاش لجلب الاسم بدل ما نستقبله كنص جاهز في الـ onclick، عشان
  // مانحطش بيانات المستخدم (زي الاسم) جوه string كود جافاسكريبت من غير داعي
  const cached = publicProfileCache[userId] || {};
  const resolvedName = name || cached.fullName || 'مستخدم';
  const resolvedInitials = initials || resolvedName.trim().slice(0, 2);
  currentChatOtherUserId = userId;
  currentConversationId = null;
  document.getElementById('chatRecipientName').textContent = resolvedName;
  document.getElementById('chatAvatar').textContent = resolvedInitials;
  clearChatAttachment();
  showPage('chat');

  // مجرد فتح شاشة الشات مش المفروض ينشئ محادثة حقيقية — إلا لو فعلاً موجودة من قبل
  try {
    const data = await apiRequest('/chat/conversations/with/' + userId);
    if (data.conversation) {
      currentConversationId = data.conversation.id;
      loadChatMessages(currentConversationId);
      startChatPolling(currentConversationId);
    } else {
      const wrap = document.getElementById('chatMessages');
      if (wrap) wrap.innerHTML = '<div class="subtitle" style="text-align:center;">ابدأ المحادثة بأول رسالة</div>';
    }
  } catch (err) {
    showToast(err.message || 'تعذر فتح المحادثة');
  }
}

// ============================================================
// PUBLIC PROFILE (page-pubprofile) - بروفايل حقيقي + تقييمات
// ============================================================

var currentPubProfileUserId = null;
var currentPubProfileRatingChoice = 0;

function reviewRowHTML(r) {
  cachePartialProfile(r.fromUser);
  const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
  const date = new Date(r.createdAt).toLocaleDateString('ar-EG');
  const currentUser = getCurrentUser();
  const fromUserId = r.fromUser ? r.fromUser.id : null;
  const isSelf = currentUser && fromUserId === currentUser.id;
  const clickHandler = (fromUserId && !isSelf) ? "openRealPublicProfile('" + fromUserId + "')" : '';
  return (
    '<div class="list-row" style="align-items:flex-start;' + (clickHandler ? ' cursor:pointer;' : '') + '"' + (clickHandler ? ' onclick="' + clickHandler + '"' : '') + '>' +
    '<div style="flex:1;">' +
    '<div style="display:flex; justify-content:space-between;">' +
    '<span style="font-size:12.5px; font-weight:700; color:var(--navy);">' + escapeHtml(r.fromUser ? r.fromUser.fullName : 'مستخدم') + '</span>' +
    '<span style="font-size:11px; color:var(--amber-dark);">' + stars + '</span>' +
    '</div>' +
    (r.comment ? '<div style="font-size:11.5px; color:var(--ink-soft); margin-top:4px;">' + escapeHtml(r.comment) + '</div>' : '') +
    '<div style="font-size:10px; color:var(--ink-faint); margin-top:4px;">' + date + '</div>' +
    '</div></div>'
  );
}

async function loadPubReviews(userId) {
  const wrap = document.getElementById('pubReviewsList');
  if (!wrap) return;
  try {
    const data = await apiRequest('/reviews/user/' + userId);
    const reviews = (data && data.reviews) || [];
    wrap.innerHTML = reviews.length
      ? reviews.map(reviewRowHTML).join('')
      : '<div class="subtitle" style="text-align:center;">لسه مفيش تقييمات</div>';

    // حدّث متوسط التقييم والعدد فورًا من نفس البيانات، من غير ما نستنى ريفرش أو دخول تاني
    if (currentPubProfileUserId === userId) {
      const avg = reviews.length ? (reviews.reduce(function (s, r) { return s + r.rating; }, 0) / reviews.length) : 0;
      const ratingEl = document.getElementById('pubRating');
      const reviewsEl = document.getElementById('pubReviews');
      if (ratingEl) ratingEl.textContent = avg.toFixed(1);
      if (reviewsEl) reviewsEl.textContent = reviews.length;
    }
  } catch (err) {
    wrap.innerHTML = '<div class="subtitle" style="text-align:center;">تعذر تحميل التقييمات</div>';
  }
}

async function loadMyReviews() {
  const wrap = document.getElementById('profileReviewsList');
  if (!wrap) return;
  const me = getCurrentUser();
  if (!me) return;
  try {
    const data = await apiRequest('/reviews/user/' + me.id);
    const reviews = (data && data.reviews) || [];
    wrap.innerHTML = reviews.length
      ? reviews.map(reviewRowHTML).join('')
      : '<div class="subtitle" style="text-align:center;">لسه محدش قيّمك</div>';

    // حدّث رقم التقييم والعدد فورًا من غير ما نستنى خروج ودخول تاني
    const avg = reviews.length ? (reviews.reduce(function (s, r) { return s + r.rating; }, 0) / reviews.length) : 0;
    const ratingStat = document.getElementById('profileRatingStat');
    const reviewsStat = document.getElementById('profileReviewsStat');
    if (ratingStat) ratingStat.textContent = avg.toFixed(1);
    if (reviewsStat) reviewsStat.textContent = reviews.length;
  } catch (err) {
    wrap.innerHTML = '<div class="subtitle" style="text-align:center;">تعذر تحميل التقييمات</div>';
  }
}

function setPubRatingStars(n) {
  currentPubProfileRatingChoice = n;
  const stars = document.querySelectorAll('#pubStarPicker span');
  stars.forEach(function (s) {
    const on = Number(s.getAttribute('data-star')) <= n;
    s.style.color = on ? 'var(--amber-dark)' : 'var(--ink-faint)';
  });
}

async function submitPubReview() {
  if (!currentPubProfileUserId) return;
  if (!currentPubProfileRatingChoice) {
    showToast('اختار عدد النجوم الأول');
    return;
  }
  const commentEl = document.getElementById('pubReviewComment');
  try {
    await apiRequest('/reviews', {
      method: 'POST',
      body: JSON.stringify({
        toUserId: currentPubProfileUserId,
        rating: currentPubProfileRatingChoice,
        comment: commentEl ? commentEl.value.trim() || undefined : undefined,
      }),
    });
    showToast('تم إرسال التقييم ✓');
    if (commentEl) commentEl.value = '';
    setPubRatingStars(0);
    loadPubReviews(currentPubProfileUserId);
  } catch (err) {
    showToast(err.message || 'تعذر إرسال التقييم');
  }
}

function renderPublicProfile(user) {
  const initials = (user.fullName || 'م ص').trim().slice(0, 2);

  document.getElementById('pubAvatar').textContent = initials;
  document.getElementById('pubAvatar').style.backgroundImage = user.avatarUrl ? 'url(' + user.avatarUrl + ')' : '';
  document.getElementById('pubAvatar').style.backgroundSize = 'cover';
  document.getElementById('pubAvatar').style.backgroundPosition = 'center';
  document.getElementById('pubName').textContent = user.fullName || '—';
  document.getElementById('pubSubtitle').textContent = ACCOUNT_TYPE_LABELS[user.accountType] || user.accountType || '';

  const verifiedBadge = document.getElementById('pubVerifiedBadge');
  const isVerified = user.verification === 'verified';
  verifiedBadge.style.display = isVerified ? '' : 'none';
  verifiedBadge.textContent = (user.accountType === 'engineer' ? '🛡 موثّق نقابيًا' : '🛡 موثّق');

  document.getElementById('pubRating').textContent = Number(user.rating || 0).toFixed(1);
  document.getElementById('pubReviews').textContent = user.ratingCount || 0;
  document.getElementById('pubResponse').textContent = (user.responseRate === null || user.responseRate === undefined) ? '—' : ('٪' + user.responseRate);

  document.getElementById('pubTags').innerHTML = (user.specialties && user.specialties.length)
    ? user.specialties.map(function (s) { return '<span class="tag">' + escapeHtml(s) + '</span>'; }).join('')
    : '<span class="tag" style="color:var(--ink-faint);">لا يوجد</span>';

  document.getElementById('pubBio').textContent = user.bio || 'لا يوجد نبذة';

  document.getElementById('pubChatBtn').onclick = function () { openChatWithUser(user.id); };
  document.getElementById('pubCallBtn').onclick = function () { callSeller(user.phone || ''); };
}

async function openRealPublicProfile(userId) {
  if (!userId) return;
  currentPubProfileUserId = userId;
  setPubRatingStars(0);
  const commentEl = document.getElementById('pubReviewComment');
  if (commentEl) commentEl.value = '';
  showPage('pubprofile');

  const cached = publicProfileCache[userId];
  if (cached) {
    // عندنا بيانات جزئية عن المستخدم ده أصلاً (من كارت إعلان أو محادثة أو تقييم) — نعرضها فورًا من غير أي لودينج
    renderPublicProfile(cached);
    loadPubReviews(userId);
    apiRequest('/users/' + userId).then(function (data) {
      cachePartialProfile(data.user);
      if (currentPubProfileUserId === userId) renderPublicProfile(publicProfileCache[userId]);
    }).catch(function () { /* عندنا نسخة جزئية شغالة، مفيش داعي نزعج المستخدم */ });
    return;
  }

  document.getElementById('pubName').textContent = 'بتحمّل...';
  document.getElementById('pubReviewsList').innerHTML = '<div class="subtitle" style="text-align:center;">بتحمّل...</div>';

  try {
    const data = await apiRequest('/users/' + userId);
    cachePartialProfile(data.user);
    renderPublicProfile(publicProfileCache[userId]);
    loadPubReviews(userId);
  } catch (err) {
    document.getElementById('pubName').textContent = 'تعذر تحميل البروفايل';
    showToast(err.message || 'تعذر تحميل البروفايل');
  }
}

function openCurrentChatProfile() {
  if (!currentChatOtherUserId) {
    showToast('مش متاح دلوقتي');
    return;
  }
  openRealPublicProfile(currentChatOtherUserId);
}

// ============================================================
// REQUESTS (طلبات الإيجار/الشراء) - نشر طلب حقيقي على الباك اند
// ============================================================

async function publishRequestAPI(payload) {
  return apiRequest('/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function updateRequestAPI(id, payload) {
  return apiRequest('/requests/' + id, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

async function submitJobPosting() {
  const titleInput = document.getElementById('jobTitleInput');
  const jobTypeCard = document.querySelector('.job-type-card.on');
  const workTypeCard = document.querySelector('#workTypeOptions .worktype-card.on');
  const governorate = (document.getElementById('jobGovernorate') || {}).value || '';
  const description = (document.getElementById('jobDescription') || {}).value || '';
  const salary = (document.getElementById('jobSalary') || {}).value || '';

  const title = titleInput ? titleInput.value.trim() : '';
  if (!title) {
    showToast('اكتب عنوان الإعلان');
    return;
  }

  try {
    await apiRequest('/jobs', {
      method: 'POST',
      body: JSON.stringify({
        title,
        jobType: jobTypeCard ? jobTypeCard.getAttribute('data-jobtype') : 'engineer',
        workType: workTypeCard ? workTypeCard.getAttribute('data-worktype') : 'full',
        governorate,
        description: description.trim() || undefined,
        salary: salary.trim() || undefined,
      }),
    });
    showToast('تم نشر الإعلان ✓');
    if (titleInput) titleInput.value = '';
    setTimeout(function () { showPage('home'); loadHomeEquipment(); }, 700);
  } catch (err) {
    showToast(err.message || 'حصل خطأ أثناء نشر الإعلان');
  }
}

// ============================================================
// JOBS (الوظائف) - التواصل مع صاحب الإعلان
// ============================================================

async function contactJobPoster(jobId, message) {
  return apiRequest('/jobs/' + jobId + '/contact', {
    method: 'POST',
    body: JSON.stringify({ message: message || '' }),
  });
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  const params = new URLSearchParams(location.search);
  const resetToken = params.get('resetToken');
  if (resetToken) {
    window.__resetToken = resetToken;
    showPage('reset-password');
    return;
  }

  loadHomeEquipment();

  // لو المستخدم عامل تسجيل دخول بالفعل من زيارة سابقة، يدخل على طول للصفحة الرئيسية
  if (getAuthToken() && document.getElementById('page-login')) {
    showPage('home');
  }

  if (getAuthToken()) {
    renderUserProfile(getCurrentUser());
    refreshCurrentUser();
    startNotificationPolling();
  }
});
