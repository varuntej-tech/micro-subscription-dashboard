/**
 * Micro-Subscription & Smart Renewal Dashboard
 * Modular Client Application
 */

// Application State
const state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  unverifiedEmail: localStorage.getItem('unverifiedEmail') || '',
  subscriptions: [],
  runwayMetrics: null,
  currentCalendarDate: new Date(),
  categoryChart: null,
  resendCooldownSeconds: 0,
  resendInterval: null,
  otpExpiryTimer: null,
  otpTimeRemaining: 300,
  otpTargetEmail: '',
  phoneConfirmationResult: null,
  targetPhoneNumber: ''
};

// Firebase Dynamic Initialization (Config loaded securely from server .env - ZERO keys in repo)
let firebaseInitPromise = null;

async function ensureFirebaseInitialized() {
  if (typeof firebase === 'undefined') return false;
  if (firebase.apps && firebase.apps.length > 0) return true;

  if (!firebaseInitPromise) {
    firebaseInitPromise = (async () => {
      try {
        const res = await fetch('/api/config/firebase');
        if (!res.ok) throw new Error('Could not load auth configuration');
        const config = await res.json();
        if (!config || !config.apiKey) {
          console.warn('[Firebase] Configuration unavailable from server.');
          return false;
        }
        if (!firebase.apps.length) {
          firebase.initializeApp(config);
        }
        console.log('[Firebase] Initialized securely from server environment.');
        return true;
      } catch (err) {
        console.warn('[Firebase] Initialization error:', err.message);
        return false;
      }
    })();
  }
  return firebaseInitPromise;
}

// Trigger background initialization on script load
if (typeof firebase !== 'undefined') {
  ensureFirebaseInitialized();
}

// UI Element Selectors
const elements = {
  // Google 1-Click Sign-In
  btnGoogleSignin: document.getElementById('btn-google-signin'),
  btnGoogleSigninText: document.getElementById('btn-google-signin-text'),

  // Navigation & Headers
  navAuthActions: document.getElementById('nav-auth-actions'),
  navUserEmail: document.getElementById('nav-user-email'),
  btnToggleMailbox: document.getElementById('btn-toggle-mailbox'),
  mailboxBadge: document.getElementById('mailbox-badge'),
  btnCronSimulate: document.getElementById('btn-cron-simulate'),
  btnOpenAddModal: document.getElementById('btn-open-add-modal'),
  btnLogout: document.getElementById('btn-logout'),

  // Views
  viewAuth: document.getElementById('view-auth'),
  viewVerify: document.getElementById('view-verify'),
  viewDashboard: document.getElementById('view-dashboard'),

  // Auth Forms & Tabs
  tabLogin: document.getElementById('tab-login'),
  tabOtpLogin: document.getElementById('tab-otp-login'),
  tabPhoneLogin: document.getElementById('tab-phone-login'),
  tabSignup: document.getElementById('tab-signup'),
  formLogin: document.getElementById('form-login'),
  formSignup: document.getElementById('form-signup'),
  loginEmail: document.getElementById('login-email'),
  loginPassword: document.getElementById('login-password'),
  loginErrorAlert: document.getElementById('login-error-alert'),
  loginErrorText: document.getElementById('login-error-text'),
  signupEmail: document.getElementById('signup-email'),
  signupPassword: document.getElementById('signup-password'),
  signupConfirmPassword: document.getElementById('signup-confirm-password'),
  signupErrorAlert: document.getElementById('signup-error-alert'),
  signupErrorText: document.getElementById('signup-error-text'),

  // Email OTP Two-State Flow Elements
  containerOtpFlow: document.getElementById('container-otp-flow'),
  otpFlowAlert: document.getElementById('otp-flow-alert'),
  otpFlowAlertIcon: document.getElementById('otp-flow-alert-icon'),
  otpFlowAlertText: document.getElementById('otp-flow-alert-text'),
  otpStateSend: document.getElementById('otp-state-send'),
  otpInputEmail: document.getElementById('otp-input-email'),
  btnSendOtp: document.getElementById('btn-send-otp'),
  btnSendOtpText: document.getElementById('btn-send-otp-text'),
  otpStateVerify: document.getElementById('otp-state-verify'),
  otpTargetEmailDisplay: document.getElementById('otp-target-email-display'),
  btnOtpChangeEmail: document.getElementById('btn-otp-change-email'),
  otpCountdownText: document.getElementById('otp-countdown-text'),
  otpInputCode: document.getElementById('otp-input-code'),
  btnVerifyOtp: document.getElementById('btn-verify-otp'),
  btnVerifyOtpText: document.getElementById('btn-verify-otp-text'),
  btnResendOtp: document.getElementById('btn-resend-otp'),
  btnResendOtpText: document.getElementById('btn-resend-otp-text'),

  // Phone SMS Authentication Flow Elements
  containerPhoneFlow: document.getElementById('container-phone-flow'),
  phoneFlowAlert: document.getElementById('phone-flow-alert'),
  phoneFlowAlertIcon: document.getElementById('phone-flow-alert-icon'),
  phoneFlowAlertText: document.getElementById('phone-flow-alert-text'),
  phoneStateSend: document.getElementById('phone-state-send'),
  phoneInputCountry: document.getElementById('phone-input-country'),
  phoneInputNumber: document.getElementById('phone-input-number'),
  btnSendPhoneOtp: document.getElementById('btn-send-phone-otp'),
  btnSendPhoneOtpText: document.getElementById('btn-send-phone-otp-text'),
  phoneStateVerify: document.getElementById('phone-state-verify'),
  phoneTargetDisplay: document.getElementById('phone-target-display'),
  btnPhoneChange: document.getElementById('btn-phone-change'),
  phoneInputCode: document.getElementById('phone-input-code'),
  btnVerifyPhoneOtp: document.getElementById('btn-verify-phone-otp'),
  btnVerifyPhoneOtpText: document.getElementById('btn-verify-phone-otp-text'),
  btnResendPhoneOtp: document.getElementById('btn-resend-phone-otp'),

  // Interstitial Verification View
  verifyEmailDisplay: document.getElementById('verify-email-display'),
  verifyStatusAlert: document.getElementById('verify-status-alert'),
  verifyStatusText: document.getElementById('verify-status-text'),
  formVerifyOtp: document.getElementById('form-verify-otp'),
  otpInputs: document.querySelectorAll('.otp-input'),
  manualTokenInput: document.getElementById('manual-token-input'),
  btnVerifyTokenManual: document.getElementById('btn-verify-token-manual'),
  btnResendVerification: document.getElementById('btn-resend-verification'),
  resendBtnText: document.getElementById('resend-btn-text'),
  btnInspectInMailbox: document.getElementById('btn-inspect-in-mailbox'),
  btnBackToLogin: document.getElementById('btn-back-to-login'),

  // Runway Metrics Cards
  metricDaily: document.getElementById('metric-daily'),
  metricWeekly: document.getElementById('metric-weekly'),
  metricMonthly: document.getElementById('metric-monthly'),
  metricAnnual: document.getElementById('metric-annual'),

  // Calendar
  calPrev: document.getElementById('cal-prev'),
  calNext: document.getElementById('cal-next'),
  calToday: document.getElementById('cal-today'),
  calMonthDisplay: document.getElementById('cal-month-display'),
  calendarGrid: document.getElementById('calendar-grid'),

  // Analytics
  categorySummaryList: document.getElementById('category-summary-list'),

  // Subscriptions Table
  subSearch: document.getElementById('sub-search'),
  subFilterCategory: document.getElementById('sub-filter-category'),
  subSortBy: document.getElementById('sub-sort-by'),
  subscriptionsTableBody: document.getElementById('subscriptions-table-body'),
  subscriptionsEmpty: document.getElementById('subscriptions-empty'),
  btnEmptyAdd: document.getElementById('btn-empty-add'),

  // Subscription Modal
  modalSub: document.getElementById('modal-sub'),
  modalSubTitle: document.getElementById('modal-sub-title'),
  btnCloseSubModal: document.getElementById('btn-close-sub-modal'),
  btnCancelSub: document.getElementById('btn-cancel-sub'),
  formSub: document.getElementById('form-sub'),
  subId: document.getElementById('sub-id'),
  subServiceName: document.getElementById('sub-service-name'),
  subCost: document.getElementById('sub-cost'),
  subCurrency: document.getElementById('sub-currency'),
  subCycle: document.getElementById('sub-cycle'),
  subCategory: document.getElementById('sub-category'),
  subNextDate: document.getElementById('sub-next-date'),
  presetButtons: document.querySelectorAll('.preset-pill'),

  // Calendar Event Details Modal
  modalCalDetails: document.getElementById('modal-cal-details'),
  btnCloseCalDetails: document.getElementById('btn-close-cal-details'),
  btnCalDetailsDismiss: document.getElementById('btn-cal-details-dismiss'),
  calDetailsContent: document.getElementById('cal-details-content'),

  // Dev Mailbox Drawer
  drawerMailbox: document.getElementById('drawer-mailbox'),
  btnCloseMailbox: document.getElementById('btn-close-mailbox'),
  btnRefreshMailbox: document.getElementById('btn-refresh-mailbox'),
  btnClearMailbox: document.getElementById('btn-clear-mailbox'),
  mailboxList: document.getElementById('mailbox-list')
};

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `pointer-events-auto p-4 rounded-xl shadow-2xl border text-xs font-semibold flex items-center justify-between gap-3 transform transition-all duration-300 translate-y-2 opacity-0`;

  let icon = 'fa-circle-info';
  let colors = 'bg-slate-900/95 border-slate-700 text-slate-100';

  if (type === 'success') {
    icon = 'fa-circle-check';
    colors = 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200';
  } else if (type === 'error') {
    icon = 'fa-triangle-exclamation';
    colors = 'bg-rose-950/95 border-rose-500/40 text-rose-200';
  } else if (type === 'warning') {
    icon = 'fa-circle-exclamation';
    colors = 'bg-amber-950/95 border-amber-500/40 text-amber-200';
  }

  toast.className += ` ${colors}`;
  toast.innerHTML = `
    <div class="flex items-center gap-2.5">
      <i class="fa-solid ${icon} text-sm"></i>
      <span>${message}</span>
    </div>
    <button class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
  `;

  const closeBtn = toast.querySelector('button');
  closeBtn.onclick = () => {
    toast.classList.add('opacity-0', 'scale-95');
    setTimeout(() => toast.remove(), 200);
  };

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('opacity-0', 'translate-y-2');
  });

  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('opacity-0', 'scale-95');
      setTimeout(() => toast.remove(), 200);
    }
  }, 4500);
}

// ==========================================
// HTTP API CLIENT (FETCH WRAPPER)
// ==========================================
async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  // Handle strictly guarded unverified access
  if (response.status === 403 && data.unverified) {
    state.unverifiedEmail = data.email || state.unverifiedEmail;
    localStorage.setItem('unverifiedEmail', state.unverifiedEmail);
    navigateTo('verify-email');
  } else if (response.status === 401) {
    // Expired or invalid token
    if (state.token) {
      logout();
      showToast('Session expired. Please sign in again.', 'warning');
    }
  }

  return { status: response.status, ok: response.ok, data };
}

// ==========================================
// ROUTER & VIEW GUARDING
// ==========================================
function navigateTo(viewName) {
  // Update hash without triggering reload
  window.location.hash = viewName;
  renderView();
}

function renderView() {
  const hash = window.location.hash.replace('#', '') || '';
  const [route, queryString] = hash.split('?');

  // Check URL query parameters for direct token verification
  if (queryString) {
    const params = new URLSearchParams(queryString);
    const token = params.get('token');
    const email = params.get('email');
    if (token) {
      handleAutoTokenVerification(token, email);
      return;
    }
  }

  // Hide all main views
  elements.viewAuth.classList.add('hidden');
  elements.viewVerify.classList.add('hidden');
  elements.viewDashboard.classList.add('hidden');
  elements.navAuthActions.classList.add('hidden');

  // Strict Route Guarding Logic
  if (route === 'dashboard') {
    if (!state.token || !state.user) {
      // Not logged in -> go to login
      navigateTo('login');
      return;
    }
    if (!state.user.is_verified) {
      // Unverified user -> strictly restrict and redirect to interstitial screen
      state.unverifiedEmail = state.user.email;
      navigateTo('verify-email');
      showToast('Please verify your email to access the dashboard.', 'warning');
      return;
    }

    // Verified & Authenticated -> Render Dashboard
    elements.viewDashboard.classList.remove('hidden');
    elements.navAuthActions.classList.remove('hidden');
    elements.navAuthActions.classList.add('flex');
    elements.navUserEmail.textContent = state.user.email;
    loadDashboardData();
    return;
  }

  if (route === 'verify-email') {
    elements.viewVerify.classList.remove('hidden');
    elements.verifyEmailDisplay.textContent = state.unverifiedEmail || 'your email address';
    resetOtpInputs();
    fetchDevEmails();
    return;
  }

  // Default: Auth view (login or signup)
  if (state.token && state.user && state.user.is_verified) {
    // Already logged in & verified -> redirect to dashboard
    navigateTo('dashboard');
    return;
  }

  elements.viewAuth.classList.remove('hidden');
  if (route === 'signup') {
    showSignupTab();
  } else if (route === 'otp' || route === 'otp-login') {
    showOtpTab();
  } else if (route === 'phone' || route === 'phone-login') {
    showPhoneTab();
  } else {
    showLoginTab();
  }
}

const TAB_ACTIVE_CLASS = 'py-2 text-[11px] font-semibold rounded-lg transition-all bg-indigo-600 text-white shadow text-center';
const TAB_INACTIVE_CLASS = 'py-2 text-[11px] font-semibold rounded-lg transition-all text-slate-400 hover:text-slate-200 text-center';

function showLoginTab() {
  if (elements.tabLogin) elements.tabLogin.className = TAB_ACTIVE_CLASS;
  if (elements.tabOtpLogin) elements.tabOtpLogin.className = TAB_INACTIVE_CLASS;
  if (elements.tabPhoneLogin) elements.tabPhoneLogin.className = TAB_INACTIVE_CLASS;
  if (elements.tabSignup) elements.tabSignup.className = TAB_INACTIVE_CLASS;

  elements.formLogin.classList.remove('hidden');
  elements.containerOtpFlow.classList.add('hidden');
  if (elements.containerPhoneFlow) elements.containerPhoneFlow.classList.add('hidden');
  elements.formSignup.classList.add('hidden');
  elements.loginErrorAlert.classList.add('hidden');
}

function showOtpTab() {
  if (elements.tabOtpLogin) elements.tabOtpLogin.className = TAB_ACTIVE_CLASS;
  if (elements.tabLogin) elements.tabLogin.className = TAB_INACTIVE_CLASS;
  if (elements.tabPhoneLogin) elements.tabPhoneLogin.className = TAB_INACTIVE_CLASS;
  if (elements.tabSignup) elements.tabSignup.className = TAB_INACTIVE_CLASS;

  elements.containerOtpFlow.classList.remove('hidden');
  elements.formLogin.classList.add('hidden');
  if (elements.containerPhoneFlow) elements.containerPhoneFlow.classList.add('hidden');
  elements.formSignup.classList.add('hidden');
  hideOtpAlert();
  if (!state.otpTargetEmail) {
    showOtpState1();
  }
}

function showPhoneTab() {
  if (elements.tabPhoneLogin) elements.tabPhoneLogin.className = TAB_ACTIVE_CLASS;
  if (elements.tabLogin) elements.tabLogin.className = TAB_INACTIVE_CLASS;
  if (elements.tabOtpLogin) elements.tabOtpLogin.className = TAB_INACTIVE_CLASS;
  if (elements.tabSignup) elements.tabSignup.className = TAB_INACTIVE_CLASS;

  if (elements.containerPhoneFlow) elements.containerPhoneFlow.classList.remove('hidden');
  elements.formLogin.classList.add('hidden');
  elements.containerOtpFlow.classList.add('hidden');
  elements.formSignup.classList.add('hidden');
  hidePhoneAlert();
  if (!state.phoneConfirmationResult) {
    showPhoneState1();
  }
}

function showSignupTab() {
  if (elements.tabSignup) elements.tabSignup.className = TAB_ACTIVE_CLASS;
  if (elements.tabLogin) elements.tabLogin.className = TAB_INACTIVE_CLASS;
  if (elements.tabOtpLogin) elements.tabOtpLogin.className = TAB_INACTIVE_CLASS;
  if (elements.tabPhoneLogin) elements.tabPhoneLogin.className = TAB_INACTIVE_CLASS;

  elements.formSignup.classList.remove('hidden');
  elements.formLogin.classList.add('hidden');
  elements.containerOtpFlow.classList.add('hidden');
  if (elements.containerPhoneFlow) elements.containerPhoneFlow.classList.add('hidden');
  elements.signupErrorAlert.classList.add('hidden');
}

// ==========================================
// EMAIL OTP FLOW HELPERS & HANDLERS
// ==========================================
function showOtpAlert(message, type = 'error') {
  elements.otpFlowAlert.classList.remove(
    'hidden',
    'bg-rose-500/10', 'border-rose-500/20', 'text-rose-300',
    'bg-emerald-500/10', 'border-emerald-500/20', 'text-emerald-300',
    'bg-indigo-500/10', 'border-indigo-500/20', 'text-indigo-300',
    'bg-amber-500/10', 'border-amber-500/20', 'text-amber-300'
  );

  if (type === 'success') {
    elements.otpFlowAlert.classList.add('bg-emerald-500/10', 'border-emerald-500/20', 'text-emerald-300');
    elements.otpFlowAlertIcon.className = 'fa-solid fa-circle-check mt-0.5 text-emerald-400';
  } else if (type === 'warning') {
    elements.otpFlowAlert.classList.add('bg-amber-500/10', 'border-amber-500/20', 'text-amber-300');
    elements.otpFlowAlertIcon.className = 'fa-solid fa-triangle-exclamation mt-0.5 text-amber-400';
  } else if (type === 'info') {
    elements.otpFlowAlert.classList.add('bg-indigo-500/10', 'border-indigo-500/20', 'text-indigo-300');
    elements.otpFlowAlertIcon.className = 'fa-solid fa-circle-info mt-0.5 text-indigo-400';
  } else {
    elements.otpFlowAlert.classList.add('bg-rose-500/10', 'border-rose-500/20', 'text-rose-300');
    elements.otpFlowAlertIcon.className = 'fa-solid fa-circle-exclamation mt-0.5 text-rose-400';
  }

  elements.otpFlowAlertText.innerHTML = message;
}

function hideOtpAlert() {
  elements.otpFlowAlert.classList.add('hidden');
}

function showOtpState1() {
  elements.otpStateSend.classList.remove('hidden');
  elements.otpStateVerify.classList.add('hidden');
  hideOtpAlert();
  stopOtpCountdown();
  elements.otpInputEmail.focus();
}

function showOtpState2(email) {
  state.otpTargetEmail = email;
  elements.otpTargetEmailDisplay.textContent = email;
  elements.otpStateSend.classList.add('hidden');
  elements.otpStateVerify.classList.remove('hidden');
  elements.otpInputCode.value = '';
  elements.otpInputCode.focus();
  startOtpCountdown(300); // 5 minutes = 300 seconds
}

function startOtpCountdown(seconds = 300) {
  stopOtpCountdown();
  state.otpTimeRemaining = seconds;
  updateOtpCountdownDisplay();

  state.otpExpiryTimer = setInterval(() => {
    state.otpTimeRemaining--;
    if (state.otpTimeRemaining <= 0) {
      stopOtpCountdown();
      elements.otpCountdownText.textContent = 'Expired';
      elements.otpCountdownText.classList.remove('text-amber-400');
      elements.otpCountdownText.classList.add('text-rose-400');
      showOtpAlert('Your OTP has expired (5-minute limit exceeded). Please click Resend OTP to receive a new code.', 'error');
    } else {
      updateOtpCountdownDisplay();
    }
  }, 1000);
}

function stopOtpCountdown() {
  if (state.otpExpiryTimer) {
    clearInterval(state.otpExpiryTimer);
    state.otpExpiryTimer = null;
  }
}

function updateOtpCountdownDisplay() {
  const mins = Math.floor(state.otpTimeRemaining / 60);
  const secs = state.otpTimeRemaining % 60;
  elements.otpCountdownText.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  elements.otpCountdownText.classList.remove('text-rose-400');
  elements.otpCountdownText.classList.add('text-amber-400');
}

async function handleSendOtp() {
  hideOtpAlert();
  const email = elements.otpInputEmail.value.trim();

  if (!email) {
    showOtpAlert('Please enter your email address.', 'error');
    elements.otpInputEmail.focus();
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showOtpAlert('Please enter a valid email address.', 'error');
    elements.otpInputEmail.focus();
    return;
  }

  elements.btnSendOtp.disabled = true;
  elements.btnSendOtpText.textContent = 'Generating & Sending...';

  try {
    const res = await api('/api/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email })
    });

    if (res.ok) {
      showOtpState2(email);
      let alertMsg = `A 6-digit OTP code has been sent to <strong>${email}</strong>. Valid for 5 minutes.`;
      if (res.data.devCode) {
        alertMsg = `
          <div class="space-y-2">
            <div class="flex items-center gap-1.5 font-medium text-emerald-300">
              <span>⚡</span> <span>Instant Verification Code:</span>
            </div>
            <div class="flex items-center justify-between gap-2 bg-slate-900/90 border border-emerald-500/40 p-2.5 rounded-lg">
              <span class="font-mono text-lg font-bold text-emerald-400 tracking-widest pl-1">${res.data.devCode}</span>
              <button type="button" id="btn-autofill-otp" class="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1.5 rounded transition shadow-sm">Click to Auto-Fill ➔</button>
            </div>
            <div class="text-[11px] text-slate-400">Live SMTP is restricted on free cloud hosting. Use code above to log in!</div>
          </div>
        `;
      } else if (res.data.deliveryWarning) {
        alertMsg = `A 6-digit OTP code was generated for <strong>${email}</strong>.<br><div class="mt-1.5 pt-1.5 border-t border-amber-500/30 text-[11px] text-amber-200 font-normal">⚠️ <strong>Delivery Notice:</strong> ${res.data.deliveryWarning}</div>`;
      }
      showOtpAlert(alertMsg, res.data.devCode ? 'info' : (res.data.deliveryWarning ? 'warning' : 'success'));
      showToast(res.data.devCode ? 'Verification code ready!' : 'OTP sent! Please check your inbox.', 'success');

      if (res.data.devCode) {
        setTimeout(() => {
          const btnAutofill = document.getElementById('btn-autofill-otp');
          if (btnAutofill) {
            btnAutofill.onclick = () => {
              elements.otpInputCode.value = res.data.devCode;
              elements.otpInputCode.focus();
            };
          }
        }, 50);
      }
    } else {
      showOtpAlert(res.data.error || 'Failed to send OTP. Please try again.', 'error');
    }
  } catch (err) {
    showOtpAlert('Network error while requesting OTP code.', 'error');
  } finally {
    elements.btnSendOtp.disabled = false;
    elements.btnSendOtpText.textContent = 'Send OTP';
  }
}

async function handleVerifyOtp() {
  hideOtpAlert();
  const email = state.otpTargetEmail || elements.otpInputEmail.value.trim();
  const otp = elements.otpInputCode.value.trim();

  if (!email) {
    showOtpAlert('Target email is missing. Please restart the OTP flow.', 'error');
    showOtpState1();
    return;
  }

  if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
    showOtpAlert('Please enter a valid 6-digit numeric OTP code.', 'error');
    elements.otpInputCode.focus();
    return;
  }

  elements.btnVerifyOtp.disabled = true;
  elements.btnVerifyOtpText.textContent = 'Verifying Code...';

  try {
    const res = await api('/api/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp })
    });

    if (res.ok && res.data.token) {
      stopOtpCountdown();
      state.token = res.data.token;
      state.user = res.data.user;
      localStorage.setItem('token', state.token);
      localStorage.setItem('user', JSON.stringify(state.user));
      showToast('OTP verified successfully! Welcome aboard.', 'success');
      navigateTo('dashboard');
    } else {
      showOtpAlert(res.data.error || 'Invalid or expired OTP code. Please try again.', 'error');
    }
  } catch (err) {
    showOtpAlert('Network error while verifying OTP code.', 'error');
  } finally {
    elements.btnVerifyOtp.disabled = false;
    elements.btnVerifyOtpText.textContent = 'Verify OTP & Log In';
  }
}

// ==========================================
// PHONE SMS AUTHENTICATION (FIREBASE)
// ==========================================
function showPhoneAlert(message, type = 'error') {
  if (!elements.phoneFlowAlert) return;
  elements.phoneFlowAlert.classList.remove(
    'hidden',
    'bg-rose-500/10', 'border-rose-500/20', 'text-rose-300',
    'bg-emerald-500/10', 'border-emerald-500/20', 'text-emerald-300',
    'bg-indigo-500/10', 'border-indigo-500/20', 'text-indigo-300',
    'bg-amber-500/10', 'border-amber-500/20', 'text-amber-300'
  );

  if (type === 'success') {
    elements.phoneFlowAlert.classList.add('bg-emerald-500/10', 'border-emerald-500/20', 'text-emerald-300');
    elements.phoneFlowAlertIcon.className = 'fa-solid fa-circle-check mt-0.5 text-emerald-400';
  } else if (type === 'warning') {
    elements.phoneFlowAlert.classList.add('bg-amber-500/10', 'border-amber-500/20', 'text-amber-300');
    elements.phoneFlowAlertIcon.className = 'fa-solid fa-triangle-exclamation mt-0.5 text-amber-400';
  } else if (type === 'info') {
    elements.phoneFlowAlert.classList.add('bg-indigo-500/10', 'border-indigo-500/20', 'text-indigo-300');
    elements.phoneFlowAlertIcon.className = 'fa-solid fa-circle-info mt-0.5 text-indigo-400';
  } else {
    elements.phoneFlowAlert.classList.add('bg-rose-500/10', 'border-rose-500/20', 'text-rose-300');
    elements.phoneFlowAlertIcon.className = 'fa-solid fa-circle-exclamation mt-0.5 text-rose-400';
  }

  elements.phoneFlowAlertText.innerHTML = message;
}

function hidePhoneAlert() {
  if (elements.phoneFlowAlert) elements.phoneFlowAlert.classList.add('hidden');
}

function showPhoneState1() {
  if (elements.phoneStateSend) elements.phoneStateSend.classList.remove('hidden');
  if (elements.phoneStateVerify) elements.phoneStateVerify.classList.add('hidden');
  hidePhoneAlert();
  if (elements.phoneInputNumber) elements.phoneInputNumber.focus();
}

function showPhoneState2(phone) {
  state.targetPhoneNumber = phone;
  if (elements.phoneTargetDisplay) elements.phoneTargetDisplay.textContent = phone;
  if (elements.phoneStateSend) elements.phoneStateSend.classList.add('hidden');
  if (elements.phoneStateVerify) elements.phoneStateVerify.classList.remove('hidden');
  if (elements.phoneInputCode) {
    elements.phoneInputCode.value = '';
    elements.phoneInputCode.focus();
  }
}

function initRecaptchaVerifier() {
  if (typeof firebase === 'undefined' || !firebase.auth) return null;
  if (!window.recaptchaVerifier) {
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      'size': 'invisible',
      'callback': () => {
        console.log('[Firebase Recaptcha] Verified for SMS dispatch');
      }
    });
  }
  return window.recaptchaVerifier;
}

async function handleSendPhoneOtp() {
  hidePhoneAlert();
  const country = elements.phoneInputCountry ? elements.phoneInputCountry.value.trim() : '+91';
  const rawNumber = elements.phoneInputNumber ? elements.phoneInputNumber.value.trim().replace(/\s+/g, '') : '';

  if (!rawNumber || rawNumber.length < 5) {
    showPhoneAlert('Please enter a valid mobile phone number.', 'error');
    if (elements.phoneInputNumber) elements.phoneInputNumber.focus();
    return;
  }

  const fullPhone = `${country}${rawNumber}`;

  elements.btnSendPhoneOtp.disabled = true;
  elements.btnSendPhoneOtpText.textContent = 'Sending SMS...';

  try {
    const isReady = await ensureFirebaseInitialized();
    if (!isReady) {
      throw new Error('Authentication service is initializing. Please wait a moment and try again.');
    }
    const appVerifier = initRecaptchaVerifier();
    if (!appVerifier) {
      throw new Error('Firebase Authentication is not ready yet. Please refresh the page.');
    }

    const confirmationResult = await firebase.auth().signInWithPhoneNumber(fullPhone, appVerifier);
    state.phoneConfirmationResult = confirmationResult;

    showPhoneState2(fullPhone);
    showPhoneAlert(`A 6-digit SMS verification code has been dispatched to <strong>${fullPhone}</strong>.`, 'success');
    showToast('SMS sent! Please check your mobile messages.', 'success');
  } catch (err) {
    console.error('[Firebase Phone Send] Error:', err);
    if (window.recaptchaVerifier) {
      try { window.recaptchaVerifier.render().then(widgetId => grecaptcha.reset(widgetId)); } catch (_) {}
    }
    showPhoneAlert(err.message || 'Failed to send SMS OTP. Please check the number and try again.', 'error');
  } finally {
    elements.btnSendPhoneOtp.disabled = false;
    elements.btnSendPhoneOtpText.textContent = 'Send SMS OTP';
  }
}

async function handleVerifyPhoneOtp() {
  hidePhoneAlert();
  const code = elements.phoneInputCode ? elements.phoneInputCode.value.trim() : '';

  if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
    showPhoneAlert('Please enter a valid 6-digit numeric SMS code.', 'error');
    if (elements.phoneInputCode) elements.phoneInputCode.focus();
    return;
  }

  if (!state.phoneConfirmationResult) {
    showPhoneAlert('Session expired. Please request a new SMS code.', 'error');
    showPhoneState1();
    return;
  }

  elements.btnVerifyPhoneOtp.disabled = true;
  elements.btnVerifyPhoneOtpText.textContent = 'Verifying SMS...';

  try {
    const result = await state.phoneConfirmationResult.confirm(code);
    const user = result.user;

    const res = await api('/api/auth/phone', {
      method: 'POST',
      body: JSON.stringify({
        phone: user.phoneNumber || state.targetPhoneNumber,
        uid: user.uid
      })
    });

    if (res.ok && res.data.token) {
      state.token = res.data.token;
      state.user = res.data.user;
      localStorage.setItem('token', state.token);
      localStorage.setItem('user', JSON.stringify(state.user));
      showToast(`Phone number verified! Welcome, ${state.user.phone || 'friend'}!`, 'success');
      navigateTo('dashboard');
    } else {
      showPhoneAlert(res.data.error || 'Server failed to authenticate phone user.', 'error');
    }
  } catch (err) {
    console.error('[Firebase Phone Verify] Error:', err);
    showPhoneAlert(err.message || 'Invalid SMS verification code. Please check and try again.', 'error');
  } finally {
    elements.btnVerifyPhoneOtp.disabled = false;
    elements.btnVerifyPhoneOtpText.textContent = 'Verify SMS & Log In';
  }
}

// ==========================================
// GOOGLE 1-CLICK AUTHENTICATION (FIREBASE)
// ==========================================
async function handleGoogleSignIn() {
  const btn = elements.btnGoogleSignin;
  const originalText = elements.btnGoogleSigninText ? elements.btnGoogleSigninText.textContent : 'Continue with Google';

  try {
    if (btn) btn.disabled = true;
    if (elements.btnGoogleSigninText) elements.btnGoogleSigninText.textContent = 'Connecting with Google...';

    const isReady = await ensureFirebaseInitialized();
    if (!isReady || typeof firebase === 'undefined' || !firebase.auth) {
      showToast('Authentication service is initializing. Please wait a moment...', 'info');
      return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await firebase.auth().signInWithPopup(provider);
    const user = result.user;

    if (!user || !user.email) {
      throw new Error('Google sign-in did not return an email address.');
    }

    if (elements.btnGoogleSigninText) elements.btnGoogleSigninText.textContent = 'Logging in...';

    // Synchronize with backend API
    const res = await api('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        uid: user.uid
      })
    });

    if (res.ok && res.data.token) {
      state.token = res.data.token;
      state.user = res.data.user;
      localStorage.setItem('token', state.token);
      localStorage.setItem('user', JSON.stringify(state.user));
      showToast(`Welcome, ${state.user.displayName || user.displayName || 'friend'}!`, 'success');
      navigateTo('dashboard');
    } else {
      showToast(res.data.error || 'Server rejected Google authentication.', 'error');
    }
  } catch (err) {
    console.error('[Google Sign-In] Error:', err);
    if (err.code === 'auth/popup-closed-by-user') {
      showToast('Sign-in popup closed.', 'info');
    } else if (err.code === 'auth/unauthorized-domain') {
      showToast('Domain not authorized in Firebase Console yet. Please add your domain to Authorized Domains.', 'error');
    } else {
      showToast(err.message || 'Google sign-in encountered an issue.', 'error');
    }
  } finally {
    if (btn) btn.disabled = false;
    if (elements.btnGoogleSigninText) elements.btnGoogleSigninText.textContent = originalText;
  }
}

// ==========================================
// AUTHENTICATION LOGIC
// ==========================================
async function handleLogin(e) {
  e.preventDefault();
  elements.loginErrorAlert.classList.add('hidden');
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value;

  const res = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  if (res.ok && res.data.token) {
    state.token = res.data.token;
    state.user = res.data.user;
    localStorage.setItem('token', state.token);
    localStorage.setItem('user', JSON.stringify(state.user));
    showToast('Signed in successfully!', 'success');
    navigateTo('dashboard');
  } else {
    if (res.data.unverified) {
      state.unverifiedEmail = email;
      localStorage.setItem('unverifiedEmail', email);
      showToast('Your account is unverified. Please enter your code.', 'warning');
      navigateTo('verify-email');
    } else {
      elements.loginErrorAlert.classList.remove('hidden');
      elements.loginErrorText.textContent = res.data.error || 'Sign in failed.';
    }
  }
}

async function handleSignup(e) {
  e.preventDefault();
  elements.signupErrorAlert.classList.add('hidden');
  const email = elements.signupEmail.value.trim();
  const password = elements.signupPassword.value;
  const confirmPassword = elements.signupConfirmPassword.value;

  if (password !== confirmPassword) {
    elements.signupErrorAlert.classList.remove('hidden');
    elements.signupErrorText.textContent = 'Passwords do not match.';
    return;
  }

  const res = await api('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  if (res.ok) {
    state.unverifiedEmail = email;
    localStorage.setItem('unverifiedEmail', email);
    showToast('Verification email dispatched! Please check your inbox.', 'success');
    navigateTo('verify-email');
    if (res.data.previewUrl) {
      const box = document.getElementById('ethereal-preview-box');
      const link = document.getElementById('ethereal-preview-link');
      if (box && link) {
        link.href = res.data.previewUrl;
        box.classList.remove('hidden');
      }
    }
  } else {
    elements.signupErrorAlert.classList.remove('hidden');
    elements.signupErrorText.textContent = res.data.error || 'Registration failed.';
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  showToast('You have been signed out.', 'info');
  navigateTo('login');
}

// ==========================================
// REAL-TIME EMAIL VERIFICATION WORKFLOW
// ==========================================
function resetOtpInputs() {
  elements.otpInputs.forEach(input => {
    input.value = '';
  });
  if (elements.otpInputs[0]) elements.otpInputs[0].focus();
  elements.verifyStatusAlert.classList.add('hidden');
}

function setupOtpInputListeners() {
  elements.otpInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      e.target.value = val;

      if (val && index < elements.otpInputs.length - 1) {
        elements.otpInputs[index + 1].focus();
      }

      // Check if all 6 digits entered
      const code = Array.from(elements.otpInputs).map(inp => inp.value).join('');
      if (code.length === 6) {
        verifyCode(code);
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        elements.otpInputs[index - 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').trim().replace(/[^0-9]/g, '');
      if (pasted.length >= 6) {
        const digits = pasted.slice(0, 6).split('');
        elements.otpInputs.forEach((inp, i) => {
          inp.value = digits[i] || '';
        });
        elements.otpInputs[5].focus();
        verifyCode(digits.join(''));
      }
    });
  });
}

async function verifyCode(codeOrToken) {
  elements.verifyStatusAlert.className = 'mt-6 p-3 rounded-lg text-xs flex items-start gap-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300';
  elements.verifyStatusAlert.classList.remove('hidden');
  elements.verifyStatusText.textContent = 'Validating verification code...';

  const res = await api('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({
      email: state.unverifiedEmail,
      otp: codeOrToken,
      token: codeOrToken
    })
  });

  if (res.ok && res.data.token) {
    state.token = res.data.token;
    state.user = res.data.user;
    localStorage.setItem('token', state.token);
    localStorage.setItem('user', JSON.stringify(state.user));
    localStorage.removeItem('unverifiedEmail');

    elements.verifyStatusAlert.className = 'mt-6 p-3 rounded-lg text-xs flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300';
    elements.verifyStatusText.textContent = 'Verification successful! Transitioning to dashboard...';

    showToast('Email verified successfully! Welcome!', 'success');
    setTimeout(() => {
      navigateTo('dashboard');
    }, 600);
  } else {
    elements.verifyStatusAlert.className = 'mt-6 p-3 rounded-lg text-xs flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-300';
    elements.verifyStatusText.textContent = res.data.error || 'Invalid or expired code.';
  }
}

async function handleAutoTokenVerification(token, email) {
  if (email) {
    state.unverifiedEmail = email;
  }
  showToast('Processing email verification token...', 'info');
  await verifyCode(token);
}

async function handleResendVerification() {
  if (state.resendCooldownSeconds > 0) return;

  const email = state.unverifiedEmail;
  if (!email) {
    showToast('No email found to resend to.', 'error');
    return;
  }

  elements.btnResendVerification.disabled = true;
  elements.resendBtnText.textContent = 'Sending...';

  const res = await api('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email })
  });

  if (res.ok) {
    showToast('Fresh verification email sent!', 'success');
    if (res.data.previewUrl) {
      const box = document.getElementById('ethereal-preview-box');
      const link = document.getElementById('ethereal-preview-link');
      if (box && link) {
        link.href = res.data.previewUrl;
        box.classList.remove('hidden');
      }
    }
    fetchDevEmails();
    startResendCooldown(60);
  } else {
    if (res.status === 429 && res.data.retryAfterSeconds) {
      startResendCooldown(res.data.retryAfterSeconds);
    }
    showToast(res.data.error || 'Could not resend verification email.', 'error');
    elements.btnResendVerification.disabled = false;
    elements.resendBtnText.textContent = 'Resend Verification Email';
  }
}

function startResendCooldown(seconds) {
  state.resendCooldownSeconds = seconds;
  clearInterval(state.resendInterval);

  elements.btnResendVerification.disabled = true;
  elements.resendBtnText.textContent = `Resend in ${state.resendCooldownSeconds}s`;

  state.resendInterval = setInterval(() => {
    state.resendCooldownSeconds--;
    if (state.resendCooldownSeconds <= 0) {
      clearInterval(state.resendInterval);
      elements.btnResendVerification.disabled = false;
      elements.resendBtnText.textContent = 'Resend Verification Email';
    } else {
      elements.resendBtnText.textContent = `Resend in ${state.resendCooldownSeconds}s`;
    }
  }, 1000);
}

// ==========================================
// DASHBOARD DATA LOADER
// ==========================================
async function loadDashboardData() {
  await Promise.all([
    fetchRunwayMetrics(),
    fetchSubscriptions()
  ]);
  renderCalendar();
  fetchDevEmails();
}

async function fetchRunwayMetrics() {
  const res = await api('/api/subscriptions/runway');
  if (res.ok && res.data.metrics) {
    state.runwayMetrics = res.data.metrics;
    renderRunwayMetrics(res.data.metrics);
    renderCategoryChart(res.data.metrics.categoryBreakdown);
  }
}

function renderRunwayMetrics(metrics) {
  const symbol = metrics.currency === 'INR' ? '₹' : metrics.currency;
  elements.metricDaily.textContent = `${symbol} ${metrics.dailyRunRate.toFixed(2)}`;
  elements.metricWeekly.textContent = `${symbol} ${metrics.weeklyRunRate.toFixed(2)}`;
  elements.metricMonthly.textContent = `${symbol} ${metrics.monthlyRunRate.toFixed(2)}`;
  elements.metricAnnual.textContent = `${symbol} ${metrics.annualRunRate.toFixed(2)}`;
}

async function fetchSubscriptions() {
  const category = elements.subFilterCategory.value;
  const search = elements.subSearch.value.trim();
  const sortVal = elements.subSortBy.value;

  let sort = 'next_renewal_date';
  let order = 'ASC';
  if (sortVal === 'cost_desc') {
    sort = 'cost';
    order = 'DESC';
  } else if (sortVal === 'cost_asc') {
    sort = 'cost';
    order = 'ASC';
  } else if (sortVal === 'service_name') {
    sort = 'service_name';
    order = 'ASC';
  }

  const query = new URLSearchParams({ category, search, sort, order }).toString();
  const res = await api(`/api/subscriptions?${query}`);

  if (res.ok && res.data.subscriptions) {
    state.subscriptions = res.data.subscriptions;
    renderSubscriptionsTable(res.data.subscriptions);
    renderCalendar();
  }
}

// Calculate days between today and renewal date
function getDaysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parts = dateStr.split('-').map(Number);
  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  target.setHours(0, 0, 0, 0);

  const diffTime = target - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function renderSubscriptionsTable(subs) {
  elements.subscriptionsTableBody.innerHTML = '';

  if (subs.length === 0) {
    elements.subscriptionsEmpty.classList.remove('hidden');
    return;
  }

  elements.subscriptionsEmpty.classList.add('hidden');

  subs.forEach(sub => {
    const daysLeft = getDaysUntil(sub.next_renewal_date);
    const isUrgent = daysLeft <= 2 && daysLeft >= 0;

    let statusBadge = '';
    if (daysLeft < 0) {
      statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">Due/Overdue</span>`;
    } else if (isUrgent) {
      statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse flex items-center gap-1 w-fit">
        <i class="fa-solid fa-triangle-exclamation"></i> 48h Alert (${daysLeft === 0 ? 'Today' : daysLeft + 'd'})
      </span>`;
    } else {
      statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">In ${daysLeft} days</span>`;
    }

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 transition-colors border-b border-slate-800/60';
    tr.innerHTML = `
      <td class="py-3 px-4 font-semibold text-white flex items-center gap-2">
        <div class="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xs">
          <i class="fa-solid fa-box-open"></i>
        </div>
        <span>${sub.service_name}</span>
      </td>
      <td class="py-3 px-4 text-slate-400">
        <span class="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px]">${sub.category}</span>
      </td>
      <td class="py-3 px-4 capitalize">
        <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${sub.billing_cycle === 'annual' ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20' : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'}">
          ${sub.billing_cycle}
        </span>
      </td>
      <td class="py-3 px-4 font-bold text-white">
        ${sub.currency === 'INR' ? '₹' : sub.currency} ${Number(sub.cost).toFixed(2)}
      </td>
      <td class="py-3 px-4 font-mono text-slate-300">
        ${sub.next_renewal_date}
      </td>
      <td class="py-3 px-4">
        ${statusBadge}
      </td>
      <td class="py-3 px-4 text-right space-x-1">
        <button class="btn-edit-sub p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors" data-id="${sub.sub_id}" title="Edit">
          <i class="fa-regular fa-pen-to-square"></i>
        </button>
        <button class="btn-delete-sub p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors" data-id="${sub.sub_id}" data-name="${sub.service_name}" title="Delete">
          <i class="fa-regular fa-trash-can"></i>
        </button>
      </td>
    `;

    elements.subscriptionsTableBody.appendChild(tr);
  });

  // Attach row listeners
  document.querySelectorAll('.btn-edit-sub').forEach(btn => {
    btn.onclick = () => openEditSubModal(btn.dataset.id);
  });
  document.querySelectorAll('.btn-delete-sub').forEach(btn => {
    btn.onclick = () => handleDeleteSub(btn.dataset.id, btn.dataset.name);
  });
}

// ==========================================
// INTERACTIVE CALENDAR RENDERER
// ==========================================
function renderCalendar() {
  const date = state.currentCalendarDate;
  const year = date.getFullYear();
  const month = date.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  elements.calMonthDisplay.textContent = `${monthNames[month]} ${year}`;

  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const prevLastDay = new Date(year, month, 0).getDate();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  elements.calendarGrid.innerHTML = '';

  // Previous month filler days
  for (let x = firstDayIndex; x > 0; x--) {
    const dayNum = prevLastDay - x + 1;
    const cell = createCalendarCell(dayNum, true);
    elements.calendarGrid.appendChild(cell);
  }

  // Current month days
  for (let i = 1; i <= lastDay; i++) {
    const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const isToday = dayStr === todayStr;
    const cell = createCalendarCell(i, false, isToday, dayStr);
    elements.calendarGrid.appendChild(cell);
  }

  // Next month filler days (fill up to 35 or 42 grid cells)
  const totalCells = firstDayIndex + lastDay;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let j = 1; j <= remaining; j++) {
    const cell = createCalendarCell(j, true);
    elements.calendarGrid.appendChild(cell);
  }
}

function createCalendarCell(dayNum, isOtherMonth = false, isToday = false, dateStr = null) {
  const cell = document.createElement('div');
  cell.className = `calendar-cell rounded-xl p-1.5 flex flex-col justify-between border border-slate-800/80 bg-slate-900/40 ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`;

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between';
  header.innerHTML = `
    <span class="text-xs font-bold ${isToday ? 'text-indigo-400 bg-indigo-500/20 px-1.5 py-0.5 rounded-full' : 'text-slate-400'}">
      ${dayNum}
    </span>
  `;
  cell.appendChild(header);

  const eventsContainer = document.createElement('div');
  eventsContainer.className = 'flex flex-col gap-1 mt-1 overflow-hidden';

  if (dateStr && state.subscriptions.length > 0) {
    // Find all subscriptions renewing on this day
    const matches = state.subscriptions.filter(s => s.next_renewal_date === dateStr);
    matches.forEach(sub => {
      const daysUntil = getDaysUntil(dateStr);
      const isUrgent = daysUntil <= 2 && daysUntil >= 0;

      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = `text-left px-1.5 py-0.5 rounded text-[10px] font-semibold truncate transition-transform hover:scale-105 flex items-center justify-between ${
        isUrgent 
          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse' 
          : 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/30 hover:bg-indigo-600/50'
      }`;
      badge.innerHTML = `
        <span class="truncate">${sub.service_name}</span>
        <span class="ml-1 opacity-90">${sub.currency === 'INR' ? '₹' : ''}${Math.round(sub.cost)}</span>
      `;
      badge.onclick = (e) => {
        e.stopPropagation();
        openCalendarEventDetails(sub);
      };
      eventsContainer.appendChild(badge);
    });
  }

  cell.appendChild(eventsContainer);
  return cell;
}

function openCalendarEventDetails(sub) {
  const days = getDaysUntil(sub.next_renewal_date);
  const isUrgent = days <= 2 && days >= 0;

  elements.calDetailsContent.innerHTML = `
    <div class="p-3 rounded-xl ${isUrgent ? 'bg-rose-500/10 border border-rose-500/30' : 'bg-slate-800 border border-slate-700'}">
      <div class="flex items-center justify-between">
        <h5 class="font-bold text-white text-base">${sub.service_name}</h5>
        <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${isUrgent ? 'bg-rose-500 text-white' : 'bg-indigo-600 text-white'}">
          ${isUrgent ? '⚠️ 48-Hour Alert!' : 'Scheduled'}
        </span>
      </div>
      <div class="mt-3 space-y-1.5 text-xs text-slate-300">
        <div class="flex justify-between">
          <span class="text-slate-400">Category:</span>
          <span class="font-medium">${sub.category}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Cost:</span>
          <span class="font-bold text-white">${sub.currency} ${Number(sub.cost).toFixed(2)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Billing Cycle:</span>
          <span class="font-medium capitalize">${sub.billing_cycle}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Renewal Date:</span>
          <span class="font-mono text-indigo-300 font-bold">${sub.next_renewal_date}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Countdown:</span>
          <span class="font-medium ${isUrgent ? 'text-rose-400 font-bold' : 'text-slate-200'}">${days >= 0 ? `${days} day(s) left` : 'Past due'}</span>
        </div>
      </div>
    </div>
  `;
  elements.modalCalDetails.classList.remove('hidden');
}

// ==========================================
// EXPENSE ANALYTICS CHART (CHART.JS)
// ==========================================
function renderCategoryChart(categoryBreakdown = {}) {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;

  const labels = Object.keys(categoryBreakdown);
  const data = Object.values(categoryBreakdown);

  // Fallback if empty
  if (labels.length === 0) {
    labels.push('No Expenses');
    data.push(1);
  }

  const colorPalette = [
    '#6366f1', // Indigo
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#f43f5e', // Rose
    '#06b6d4', // Cyan
    '#a855f7', // Purple
    '#3b82f6', // Blue
    '#64748b'  // Slate
  ];

  if (state.categoryChart) {
    state.categoryChart.destroy();
  }

  state.categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colorPalette.slice(0, labels.length),
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = Number(context.raw || 0).toFixed(2);
              return ` ₹${val}/mo`;
            }
          }
        }
      }
    }
  });

  // Render Category Breakdown list
  elements.categorySummaryList.innerHTML = '';
  const total = data.reduce((a, b) => a + b, 0) || 1;

  labels.forEach((label, idx) => {
    if (label === 'No Expenses') return;
    const amount = data[idx];
    const pct = Math.round((amount / total) * 100);
    const color = colorPalette[idx % colorPalette.length];

    const row = document.createElement('div');
    row.className = 'flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-none';
    row.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${color}"></span>
        <span class="text-slate-300 font-medium">${label}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-bold text-white">₹ ${amount.toFixed(2)}/mo</span>
        <span class="text-[10px] text-slate-500 font-semibold w-8 text-right">${pct}%</span>
      </div>
    `;
    elements.categorySummaryList.appendChild(row);
  });
}

// ==========================================
// SUBSCRIPTION MODAL ACTIONS (ADD / EDIT)
// ==========================================
function openAddSubModal() {
  elements.modalSubTitle.innerHTML = `<i class="fa-solid fa-circle-plus text-indigo-400"></i> Add New Subscription`;
  elements.formSub.reset();
  elements.subId.value = '';

  // Default next renewal date: today + 1 month
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  elements.subNextDate.value = nextMonth.toISOString().split('T')[0];

  elements.modalSub.classList.remove('hidden');
}

function openEditSubModal(subId) {
  const sub = state.subscriptions.find(s => s.sub_id === subId);
  if (!sub) return;

  elements.modalSubTitle.innerHTML = `<i class="fa-regular fa-pen-to-square text-indigo-400"></i> Edit Subscription`;
  elements.subId.value = sub.sub_id;
  elements.subServiceName.value = sub.service_name;
  elements.subCost.value = sub.cost;
  elements.subCurrency.value = sub.currency;
  elements.subCycle.value = sub.billing_cycle;
  elements.subCategory.value = sub.category;
  elements.subNextDate.value = sub.next_renewal_date;

  elements.modalSub.classList.remove('hidden');
}

function closeSubModal() {
  elements.modalSub.classList.add('hidden');
}

async function handleSaveSub(e) {
  e.preventDefault();

  const id = elements.subId.value;
  const payload = {
    service_name: elements.subServiceName.value.trim(),
    cost: parseFloat(elements.subCost.value),
    currency: elements.subCurrency.value,
    billing_cycle: elements.subCycle.value,
    category: elements.subCategory.value,
    next_renewal_date: elements.subNextDate.value
  };

  const endpoint = id ? `/api/subscriptions/${id}` : '/api/subscriptions';
  const method = id ? 'PUT' : 'POST';

  const res = await api(endpoint, {
    method,
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    showToast(id ? 'Subscription updated!' : 'Subscription added!', 'success');
    closeSubModal();
    loadDashboardData();
  } else {
    showToast(res.data.error || 'Failed to save subscription', 'error');
  }
}

async function handleDeleteSub(subId, serviceName) {
  if (!confirm(`Are you sure you want to delete "${serviceName}"?`)) return;

  const res = await api(`/api/subscriptions/${subId}`, { method: 'DELETE' });
  if (res.ok) {
    showToast(`Removed "${serviceName}"`, 'info');
    loadDashboardData();
  } else {
    showToast(res.data.error || 'Failed to delete subscription', 'error');
  }
}

// Preset button handlers
function setupPresetButtons() {
  elements.presetButtons.forEach(btn => {
    btn.onclick = () => {
      elements.subServiceName.value = btn.dataset.name;
      elements.subCategory.value = btn.dataset.category;
      elements.subCycle.value = btn.dataset.cycle;
      elements.subCost.value = btn.dataset.cost;
    };
  });
}

// ==========================================
// SIMULATE 48H CRON RUN
// ==========================================
async function handleSimulateCron() {
  elements.btnCronSimulate.disabled = true;
  elements.btnCronSimulate.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Running...`;

  const res = await api('/api/cron/trigger-now', { method: 'POST' });

  elements.btnCronSimulate.disabled = false;
  elements.btnCronSimulate.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> <span class="hidden md:inline">Simulate 48h Cron</span>`;

  if (res.ok && res.data.results) {
    const { remindersSent, renewalsRolledOver, targetDate } = res.data.results;
    showToast(`Cron Check: ${remindersSent} 48h reminders dispatched for ${targetDate}, ${renewalsRolledOver} renewals rolled over.`, 'success');
    fetchDevEmails();
    loadDashboardData();
  } else {
    showToast(res.data.error || 'Cron simulation error', 'error');
  }
}

// ==========================================
// DEV MAILBOX INSPECTOR DRAWER
// ==========================================
function openMailboxDrawer() {
  // Mailbox drawer disabled
}

function closeMailboxDrawer() {
  elements.drawerMailbox.classList.add('translate-x-full');
}

async function fetchDevEmails() {
  try {
    const res = await fetch('/api/dev/emails');
    const data = await res.json();
    if (data.success && data.emails) {
      elements.mailboxBadge.textContent = data.emails.length;
      renderMailboxList(data.emails);
    }
  } catch (err) {
    console.warn('Mailbox fetch warning:', err);
  }
}

function renderMailboxList(emails) {
  elements.mailboxList.innerHTML = '';

  if (emails.length === 0) {
    elements.mailboxList.innerHTML = `
      <div class="text-center py-12 text-slate-500">
        <i class="fa-regular fa-envelope-open text-3xl mb-2"></i>
        <p class="text-xs">No dispatched emails yet</p>
      </div>
    `;
    return;
  }

  emails.forEach(mail => {
    const timeFormatted = new Date(mail.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isVerification = mail.meta && mail.meta.type === 'VERIFICATION';
    const isRenewal = mail.meta && mail.meta.type === 'RENEWAL_ALERT';
    const isOtpFlow = mail.meta && mail.meta.type === 'EMAIL_OTP';

    const card = document.createElement('div');
    card.className = 'p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs space-y-2';

    let actionButton = '';
    if ((isVerification || isOtpFlow) && mail.meta.otp) {
      actionButton = `
        <div class="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <span class="font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">OTP: ${mail.meta.otp}</span>
          <button class="btn-use-otp px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[10px] font-bold text-white transition-colors" data-otp="${mail.meta.otp}" data-token="${mail.meta.token || ''}" data-to="${mail.to}" data-type="${isOtpFlow ? 'otp' : 'verify'}">
            Use This Code
          </button>
        </div>
      `;
    }

    let badgeClass = 'bg-rose-500/20 text-rose-300';
    let badgeText = '48h Renewal Alert';
    if (isVerification) {
      badgeClass = 'bg-indigo-500/20 text-indigo-300';
      badgeText = 'Account Verification';
    } else if (isOtpFlow) {
      badgeClass = 'bg-emerald-500/20 text-emerald-300';
      badgeText = 'Email OTP Login';
    }

    card.innerHTML = `
      <div class="flex items-center justify-between text-[11px]">
        <span class="px-2 py-0.5 rounded font-semibold ${badgeClass}">
          ${badgeText}
        </span>
        <span class="text-slate-500 font-mono">${timeFormatted}</span>
      </div>
      <div>
        <div class="font-bold text-white text-xs">${mail.subject}</div>
        <div class="text-[11px] text-slate-400 mt-0.5">To: <span class="text-slate-200">${mail.to}</span></div>
        ${mail.previewUrl ? `
          <div class="mt-1">
            <a href="${mail.previewUrl}" target="_blank" class="inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold underline">
              <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i> View email on Ethereal
            </a>
          </div>
        ` : ''}
      </div>
      ${actionButton}
    `;

    elements.mailboxList.appendChild(card);
  });

  // Attach OTP use buttons
  document.querySelectorAll('.btn-use-otp').forEach(btn => {
    btn.onclick = () => {
      const otp = btn.dataset.otp;
      const type = btn.dataset.type;
      const toEmail = btn.dataset.to;

      if (type === 'otp') {
        // Wire into Email OTP Flow
        navigateTo('otp');
        showOtpTab();
        showOtpState2(toEmail);
        elements.otpInputCode.value = otp;
        closeMailboxDrawer();
        handleVerifyOtp();
      } else if (otp && elements.otpInputs.length === 6) {
        // Wire into Interstitial Verification Screen
        const digits = otp.split('');
        elements.otpInputs.forEach((inp, i) => {
          inp.value = digits[i] || '';
        });
        closeMailboxDrawer();
        verifyCode(otp);
      }
    };
  });
}

async function handleClearMailbox() {
  await fetch('/api/dev/emails/clear', { method: 'POST' });
  fetchDevEmails();
  showToast('Dev mailbox cleared', 'info');
}

// ==========================================
// EVENT INITIALIZATION
// ==========================================
function initEvents() {
  // Navigation
  if (elements.btnToggleMailbox) elements.btnToggleMailbox.onclick = () => openMailboxDrawer();
  if (elements.btnCloseMailbox) elements.btnCloseMailbox.onclick = () => closeMailboxDrawer();
  if (elements.btnRefreshMailbox) elements.btnRefreshMailbox.onclick = () => fetchDevEmails();
  if (elements.btnClearMailbox) elements.btnClearMailbox.onclick = () => handleClearMailbox();
  if (elements.btnInspectInMailbox) elements.btnInspectInMailbox.onclick = () => openMailboxDrawer();

  elements.btnLogout.onclick = () => logout();
  elements.btnBackToLogin.onclick = () => navigateTo('login');

  // Google 1-Click Authentication
  if (elements.btnGoogleSignin) elements.btnGoogleSignin.onclick = handleGoogleSignIn;

  // Auth tabs & forms
  elements.tabLogin.onclick = () => { navigateTo('login'); showLoginTab(); };
  elements.tabOtpLogin.onclick = () => { navigateTo('otp'); showOtpTab(); };
  if (elements.tabPhoneLogin) {
    elements.tabPhoneLogin.onclick = () => { navigateTo('phone'); showPhoneTab(); };
  }
  elements.tabSignup.onclick = () => { navigateTo('signup'); showSignupTab(); };
  elements.formLogin.onsubmit = handleLogin;
  elements.formSignup.onsubmit = handleSignup;

  // Phone SMS Authentication Event Handlers
  if (elements.btnSendPhoneOtp) elements.btnSendPhoneOtp.onclick = handleSendPhoneOtp;
  if (elements.btnVerifyPhoneOtp) elements.btnVerifyPhoneOtp.onclick = handleVerifyPhoneOtp;
  if (elements.btnPhoneChange) elements.btnPhoneChange.onclick = showPhoneState1;
  if (elements.btnResendPhoneOtp) elements.btnResendPhoneOtp.onclick = handleSendPhoneOtp;
  if (elements.phoneInputNumber) {
    elements.phoneInputNumber.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSendPhoneOtp();
      }
    };
  }
  if (elements.phoneInputCode) {
    elements.phoneInputCode.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleVerifyPhoneOtp();
      }
    };
  }

  // Email OTP Two-State Flow Event Handlers
  elements.btnSendOtp.onclick = handleSendOtp;
  elements.btnVerifyOtp.onclick = handleVerifyOtp;
  elements.btnOtpChangeEmail.onclick = showOtpState1;
  elements.btnResendOtp.onclick = handleSendOtp;
  elements.otpInputEmail.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendOtp();
    }
  };
  elements.otpInputCode.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleVerifyOtp();
    }
  };

  // Interstitial verification
  setupOtpInputListeners();
  elements.formVerifyOtp.onsubmit = (e) => {
    e.preventDefault();
    const code = Array.from(elements.otpInputs).map(inp => inp.value).join('');
    if (code.length === 6) {
      verifyCode(code);
    } else {
      showToast('Please enter all 6 digits', 'warning');
    }
  };

  elements.btnVerifyTokenManual.onclick = () => {
    const val = elements.manualTokenInput.value.trim();
    if (val) verifyCode(val);
  };

  elements.btnResendVerification.onclick = handleResendVerification;

  // Subscription Modal
  elements.btnOpenAddModal.onclick = openAddSubModal;
  elements.btnEmptyAdd.onclick = openAddSubModal;
  elements.btnCloseSubModal.onclick = closeSubModal;
  elements.btnCancelSub.onclick = closeSubModal;
  elements.formSub.onsubmit = handleSaveSub;
  setupPresetButtons();

  // Calendar Detail Modal
  elements.btnCloseCalDetails.onclick = () => elements.modalCalDetails.classList.add('hidden');
  elements.btnCalDetailsDismiss.onclick = () => elements.modalCalDetails.classList.add('hidden');

  // Search & Filter
  elements.subSearch.oninput = () => fetchSubscriptions();
  elements.subFilterCategory.onchange = () => fetchSubscriptions();
  elements.subSortBy.onchange = () => fetchSubscriptions();

  // Calendar Switcher
  elements.calPrev.onclick = () => {
    state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() - 1);
    renderCalendar();
  };
  elements.calNext.onclick = () => {
    state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() + 1);
    renderCalendar();
  };
  elements.calToday.onclick = () => {
    state.currentCalendarDate = new Date();
    renderCalendar();
  };

  // Cron Simulation
  elements.btnCronSimulate.onclick = handleSimulateCron;

  // Hash change
  window.addEventListener('hashchange', renderView);
}

// App Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  initEvents();
  renderView();
  fetchDevEmails();
});
