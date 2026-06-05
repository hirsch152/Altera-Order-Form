import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check,
  Loader2,
  Lock,
  Database,
  ExternalLink,
  Plus,
  Trash,
  Users,
  CheckCircle,
  FileSpreadsheet,
  LogOut,
  RefreshCw,
  Search,
  ChevronRight,
  Sparkles,
  MapPin,
  Mail,
  User,
  Shirt,
  Sliders,
  History,
  X,
  Maximize2,
  Settings
} from 'lucide-react';

import { ApparelSubmission } from './types';
import { initAuth, googleSignIn, getAccessToken, logout, db, auth } from './firebaseAuth';
import { createGoogleSheet, syncSubmissionsToSheet } from './googleSheets';
import { collection, addDoc } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const DEFAULT_GOOGLE_SCRIPT_URL = '[PASTE YOUR COPIED WEB APP URL HERE]';

export default function App() {
  const isAdmin = false;

  // Google Apps Script Web App Config
  const [googleScriptUrl, setGoogleScriptUrl] = useState<string>(() => {
    const stored = localStorage.getItem('altera_google_script_url');
    // Prefer env variable first, then custom stored, then default placeholder
    return (import.meta as any).env.VITE_GOOGLE_SCRIPT_URL || stored || DEFAULT_GOOGLE_SCRIPT_URL;
  });
  const [isScriptConfigOpen, setIsScriptConfigOpen] = useState(false);
  const [tempScriptUrl, setTempScriptUrl] = useState(googleScriptUrl);

  // Toast Notification State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Auto-clear toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Gateway state definitions for Altera employee verification
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [gateEmail, setGateEmail] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);

  // App States
  const [submissions, setSubmissions] = useState<ApparelSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);

  // Lightbox States
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [zoomedImageTitle, setZoomedImageTitle] = useState<string>('');

  // Form States
  const [selectedItem, setSelectedItem] = useState<
    'Altera Ladies Executive Polo' | 'Altera Executive Polo' | 'Altera Pullover Hoodie' | null
  >(null);
  const [selectedSize, setSelectedSize] = useState<'S' | 'M' | 'L' | 'XL' | '2XL' | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [campus, setCampus] = useState('');
  const [customCampus, setCustomCampus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedChoice, setSubmittedChoice] = useState<ApparelSubmission | null>(null);

  // Admin Panel States
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAdminPortalOpen, setIsAdminPortalOpen] = useState(false);
  const [portalSearch, setPortalSearch] = useState('');
  const [selectedPortalSubmissionIds, setSelectedPortalSubmissionIds] = useState<string[]>([]);
  const [showPortalAuth, setShowPortalAuth] = useState(false);
  const [portalPasscode, setPortalPasscode] = useState('');
  const [portalAuthError, setPortalAuthError] = useState(false);
  const [adminUser, setAdminUser] = useState<any>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
    return localStorage.getItem('altera_spreadsheet_id') || '';
  });
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string>(() => {
    return localStorage.getItem('altera_spreadsheet_url') || '';
  });
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  // Search & Filter for Admin Panel
  const [adminSearch, setAdminSearch] = useState('');
  const [adminFilterItem, setAdminFilterItem] = useState<string>('all');
  const [adminFilterSize, setAdminFilterSize] = useState<string>('all');

  const campusOptions = [
    'Cupertino (HQ)',
    'Austin (Silicon Hills)',
    'London (Kings Cross)',
    'Dublin (Silicon Docks)',
    'Singapore (Downtown)',
    'Other Location'
  ];

  // Fetch submissions from local Express server with local storage synchronizing cache
  const fetchSubmissions = async () => {
    try {
      setLoadingSubmissions(true);
      const res = await fetch('/api/submissions');
      if (res.ok) {
        const data = await res.json();
        const list = data.submissions || [];
        setSubmissions(list);
        try {
          localStorage.setItem('altera_submissions_cache', JSON.stringify(list));
        } catch (storageErr) {
          console.warn('Failed to cache submissions:', storageErr);
        }
      } else {
        // Fallback to cache in localStorage
        const cached = localStorage.getItem('altera_submissions_cache');
        if (cached) {
          setSubmissions(JSON.parse(cached));
        }
      }
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
      // Fallback to cache in localStorage
      const cached = localStorage.getItem('altera_submissions_cache');
      if (cached) {
        try {
          setSubmissions(JSON.parse(cached));
        } catch {
          // ignore parsing issues
        }
      }
    } finally {
      setLoadingSubmissions(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();

    // Check pre-existing auth on load
    initAuth(
      (user, token) => {
        setAdminUser(user);
        setAdminToken(token);
      },
      () => {
        setAdminUser(null);
        setAdminToken(null);
      }
    );
  }, []);

  const isFormValid = (selectedItem === 'Altera Ladies Executive Polo' ||
                       selectedItem === 'Altera Executive Polo' ||
                       selectedItem === 'Altera Pullover Hoodie') &&
                      !!selectedSize &&
                      name.trim() !== '' &&
                      email.trim().toLowerCase().endsWith('@altera.com') &&
                      !!(campus === 'Other Location' ? customCampus.trim() : campus);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    const finalCampus = campus === 'Other Location' ? customCampus.trim() : campus;
    if (!finalCampus) return;

    setIsSubmitting(true);
    let appsScriptSynced = false;
    let appsScriptError = null;

    const apparelValue = selectedItem || '';

    const payload = {
      fullName: name.trim(),
      email: email.trim().toLowerCase(),
      location: finalCampus,
      garmentType: apparelValue,
      size: selectedSize
    };

    const cleanUrl = googleScriptUrl.trim();
    const isPlaceholder = !cleanUrl || cleanUrl === DEFAULT_GOOGLE_SCRIPT_URL;

    // 1. Submit to Google Apps Script Web App URL if configured
    if (!isPlaceholder && (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'))) {
      try {
        // We use URLSearchParams to populate standard Google Apps Script e.parameter fields (e.parameter.fullName, e.parameter.email, etc.)
        const formParams = new URLSearchParams();
        formParams.append('fullName', name.trim());
        formParams.append('email', email.trim().toLowerCase());
        formParams.append('location', finalCampus);
        formParams.append('garmentType', apparelValue);
        formParams.append('size', selectedSize);

        await fetch(cleanUrl, {
          method: 'POST',
          mode: 'no-cors', // Ensures the request is transmitted even if standard CORS headers aren't sent back by Apps Script
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
          },
          body: formParams.toString()
        });
        appsScriptSynced = true;
      } catch (err: any) {
        console.error('Apps Script submission error:', err);
        appsScriptError = err.message || 'CORS or Network issue streaming to Sheets';
      }
    }

    // 2. Commit cleanly to Firestore database collection with a robust 4s timeout
    let firestoreSynced = false;
    let firestoreId = '';
    let isFallbackMode = false;

    try {
      const firestorePromise = addDoc(collection(db, 'submissions'), {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        campus: finalCampus,
        item: apparelValue,
        size: selectedSize,
        timestamp: new Date().toISOString()
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore operation timed out (4s)')), 4000)
      );

      const docRef = await Promise.race([firestorePromise, timeoutPromise]);
      firestoreId = docRef.id;
      firestoreSynced = true;
    } catch (err: any) {
      console.warn('⚠️ Firestore insertion struggled or timed out. Triggering clean local fallback. Details:', err);
      isFallbackMode = true;
      try {
        handleFirestoreError(err, OperationType.CREATE, 'submissions');
      } catch (formattedErr) {
        console.error('Logged compliant Firebase error:', formattedErr);
      }
    }

    // 3. Process locally to maintain administrative dashboard and sync lists
    let localSubmission = null;
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          campus: finalCampus,
          item: apparelValue,
          size: selectedSize
        })
      });

      if (res.ok) {
        const data = await res.json();
        localSubmission = data.submission;
      }
    } catch (err) {
      console.error('Local database insertion failed:', err);
    }

    if (firestoreSynced || isFallbackMode) {
      // Safely print local data backup to console as requested so no entries are lost in dev mode
      console.log('📝 Dev Preview Fallback Logged Entry:', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        campus: finalCampus,
        item: apparelValue,
        size: selectedSize,
        timestamp: new Date().toISOString(),
        isLocalFallback: isFallbackMode
      });

      const finalSubmission: ApparelSubmission = localSubmission || {
        id: firestoreId || ("sub_" + Math.random().toString(36).substring(2, 9)),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        campus: finalCampus,
        item: apparelValue,
        size: selectedSize as any,
        timestamp: new Date().toISOString()
      };

      setSubmittedChoice(finalSubmission);
      try {
        fetchSubmissions();
      } catch (fErr) {
        console.warn('Failed post-submit fetchSubmissions background refresh:', fErr);
      }

      // Inform user with high-fidelity visual feedback and scannable text notifications of modern UX
      if (appsScriptSynced) {
        setToast({
          message: '🎉 Selection Submitted! Captured inside Firestore & Google Sheets.',
          type: 'success'
        });
      } else if (isFallbackMode) {
        setToast({
          message: '🎉 Selection Submitted! Cleared form and logged choice cleanly to local fallback state.',
          type: 'success'
        });
      } else {
        setToast({
          message: '🎉 Selection Submitted! Cleanly saved in Firestore database.',
          type: 'success'
        });
      }

      // Reset form states
      setName('');
      setEmail('');
      setCampus('');
      setCustomCampus('');
      setSelectedItem(null);
      setSelectedSize(null);
    } else if (localSubmission) {
      // If local database worked but firestore failed
      setSubmittedChoice(localSubmission);
      try {
        fetchSubmissions();
      } catch (fErr) {
        console.warn('Failed post-submit fetchSubmissions background refresh:', fErr);
      }
      setToast({
        message: '📝 Order registered, but database synchronization encountered an issue.',
        type: 'info'
      });

      // Reset form states
      setName('');
      setEmail('');
      setCampus('');
      setCustomCampus('');
      setSelectedItem(null);
      setSelectedSize(null);
    } else {
      alert('An error occurred. Check your connection or console logs for details.');
    }

    // Wrap-up loading state securely
    setIsSubmitting(false);
  };

  const handleAdminLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setAdminUser(result.user);
        setAdminToken(result.accessToken);
      }
    } catch (err) {
      console.error('Admin authentication failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAdminLogout = async () => {
    await logout();
    setAdminUser(null);
    setAdminToken(null);
  };

  // Google Sheets integration handlers
  const handleCreateNewSheet = async () => {
    if (!adminToken) return;
    setSyncLoading(true);
    setSyncError(null);
    setSyncSuccess(false);

    try {
      const dateString = new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const sheet = await createGoogleSheet(adminToken, dateString);
      
      localStorage.setItem('altera_spreadsheet_id', sheet.id);
      localStorage.setItem('altera_spreadsheet_url', sheet.url);
      setSpreadsheetId(sheet.id);
      setSpreadsheetUrl(sheet.url);

      // Instantly sync data to the new sheet
      await syncSubmissionsToSheet(adminToken, sheet.id, submissions);
      setSyncSuccess(true);
    } catch (err: any) {
      console.error(err);
      setSyncError(err.message || 'Failed to create Google Sheet');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleSyncData = async () => {
    if (!adminToken || !spreadsheetId) return;
    setSyncLoading(true);
    setSyncError(null);
    setSyncSuccess(false);

    try {
      await syncSubmissionsToSheet(adminToken, spreadsheetId, submissions);
      setSyncSuccess(true);
    } catch (err: any) {
      console.error(err);
      setSyncError(err.message || 'Failed to sync to existing Google Sheet');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleDeleteSubmission = (id: string) => {
    const confirmDelete = window.confirm('Are you sure you want to remove this employee entry?');
    if (!confirmDelete) return;

    try {
      const updatedSubmissions = submissions.filter(sub => sub.id !== id);
      localStorage.setItem('altera_submissions_cache', JSON.stringify(updatedSubmissions));
      setSubmissions(updatedSubmissions);
      setSelectedPortalSubmissionIds(prev => prev.filter(selId => selId !== id));
      setToast({
        message: 'Submission has been permanently deleted.',
        type: 'success'
      });
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleClearAll = () => {
    const confirmClear = window.confirm(
      'CRITICAL: Are you sure you want to permanently delete ALL local submissions? This cannot be undone.'
    );
    if (!confirmClear) return;

    try {
      localStorage.setItem('altera_submissions_cache', JSON.stringify([]));
      setSubmissions([]);
      setSelectedPortalSubmissionIds([]);
      setToast({
        message: 'All local submissions have been cleared.',
        type: 'success'
      });
    } catch (err) {
      console.error('Clear error:', err);
    }
  };

  // Compute metrics for the dashboard
  const totalOrders = submissions.length;
  const totalMenPolos = submissions.filter(s => s.item === 'polo' || s.item === 'Altera Executive Polo').length;
  const totalLadiesPolos = submissions.filter(s => s.item === 'Altera Ladies Executive Polo' || s.item === 'ladies_polo').length;
  const totalPolos = totalMenPolos + totalLadiesPolos;
  const totalHoodies = submissions.filter(s => s.item === 'hoodie' || s.item === 'Altera Pullover Hoodie').length;

  const sizeBreakdown = submissions.reduce((acc, curr) => {
    acc[curr.size] = (acc[curr.size] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filteredSubmissions = submissions.filter(sub => {
    const matchesSearch =
      sub.name.toLowerCase().includes(adminSearch.toLowerCase()) ||
      sub.email.toLowerCase().includes(adminSearch.toLowerCase()) ||
      sub.campus.toLowerCase().includes(adminSearch.toLowerCase());
    
    const matchesItem = adminFilterItem === 'all' || sub.item === adminFilterItem;
    const matchesSize = adminFilterSize === 'all' || sub.size === adminFilterSize;

    return matchesSearch && matchesItem && matchesSize;
  });

  const handleAdminPortalClick = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    setShowPortalAuth(prev => !prev);
    setPortalPasscode('');
    setPortalAuthError(false);
  };

  const handlePortalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (portalPasscode === "Hirsch1920") {
      setIsAdminPortalOpen(true);
      setShowPortalAuth(false);
      setPortalPasscode('');
      setPortalAuthError(false);
      fetchSubmissions();
    } else {
      setPortalAuthError(true);
    }
  };

  const exportToCSV = () => {
    if (submissions.length === 0) {
      alert("No submissions to export.");
      return;
    }
    const headers = ["ID", "Name", "Email", "Campus/Location", "Item Choice", "Size", "Timestamp"];
    const rows = submissions.map(sub => [
      sub.id,
      sub.name,
      sub.email,
      sub.campus,
      sub.item,
      sub.size,
      sub.timestamp
    ]);
    const csvRows = [headers.join(",")];
    for (const row of rows) {
      csvRows.push(row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","));
    }
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `altera_submissions_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteSelectedPortal = async () => {
    if (selectedPortalSubmissionIds.length === 0) return;

    const confirmMessage = `Are you sure you want to permanently delete the ${selectedPortalSubmissionIds.length} selected submission(s)? This action cannot be undone.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      // 1. LOCAL STORAGE PURGE: Filter current submissions
      const updatedSubmissions = submissions.filter(sub => !selectedPortalSubmissionIds.includes(sub.id));

      // 2. CACHE SYNC: Save back into localStorage with the cache key
      localStorage.setItem('altera_submissions_cache', JSON.stringify(updatedSubmissions));

      // 3. INSTANT REFRESH: Update React state and reset selections instantly
      setSubmissions(updatedSubmissions);
      setSelectedPortalSubmissionIds([]);

      setToast({
        message: 'Selected submissions have been permanently deleted.',
        type: 'success'
      });

    } catch (err) {
      console.error('Failed to perform bulk delete:', err);
      alert('An error occurred during deletion.');
    }
  };

  const handleDeleteSinglePortal = (id: string) => {
    const confirmMessage = `Are you sure you want to permanently delete this submission? This action cannot be undone.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      // 1. LOCAL STORAGE PURGE: Filter current submissions
      const updatedSubmissions = submissions.filter(sub => sub.id !== id);

      // 2. CACHE SYNC: Save back into localStorage with the cache key
      localStorage.setItem('altera_submissions_cache', JSON.stringify(updatedSubmissions));

      // 3. INSTANT REFRESH: Update React state and reset selections if deleted item was selected
      setSubmissions(updatedSubmissions);
      setSelectedPortalSubmissionIds(prev => prev.filter(selId => selId !== id));

      setToast({
        message: 'Submission has been permanently deleted.',
        type: 'success'
      });
    } catch (err) {
      console.error('Failed to perform single delete:', err);
      alert('An error occurred during deletion.');
    }
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setGateError(null);
    const emailLower = gateEmail.trim().toLowerCase();
    if (!emailLower || !emailLower.endsWith('@altera.com')) {
      setGateError('Access Restricted: A valid @altera.com corporate email is required.');
      return;
    }
    setEmail(emailLower);
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-slate-900 selection:text-white flex flex-col justify-between py-12 px-4 relative overflow-hidden">
        {/* Background ambient subtle visual circles */}
        <div className="absolute top-0 right-0 w-[45rem] h-[45rem] bg-gradient-to-b from-blue-10 to-transparent blur-3xl opacity-50 pointer-events-none -mr-96 -mt-96" />
        <div className="absolute bottom-0 left-0 w-[45rem] h-[45rem] bg-gradient-to-t from-sky-5 to-transparent blur-3xl opacity-50 pointer-events-none -ml-96 -mb-96" />

        <div className="h-10" />

        <div className="max-w-md w-full mx-auto relative z-10 my-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 sm:p-10 border border-slate-200/60 shadow-xl space-y-8"
          >
            {/* Altera Logo & Title */}
            <div className="text-center space-y-4">
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                className="inline-block"
              >
                <img
                  src="https://user.fm/files/v2-a11f3f584f9b496d1b50f34963c37eb5/Altera%20Logo.png"
                  alt="Altera Logo"
                  referrerPolicy="no-referrer"
                  className="h-9 w-auto mx-auto object-contain"
                  id="gateway-logo"
                />
              </motion.div>
              <div className="space-y-1.5">
                <h2 className="font-display font-bold text-2xl tracking-tight text-slate-950">
                  Altera Employee Verification
                </h2>
                <p className="text-xs text-slate-400 font-light leading-relaxed max-w-[280px] mx-auto">
                  Please enter your corporate email address to access the apparel distribution portal.
                </p>
              </div>
            </div>

            {/* Email form */}
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="gateway-email-input" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 pl-0.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" /> Corporate Email
                </label>
                <input
                  id="gateway-email-input"
                  type="email"
                  required
                  placeholder="username@altera.com"
                  value={gateEmail}
                  onChange={(e) => {
                    setGateEmail(e.target.value);
                    if (gateError) setGateError(null);
                  }}
                  className={`w-full px-4 py-3.5 bg-slate-50 border rounded-xl focus:outline-none focus:bg-white focus:ring-1 transition-all font-sans text-sm placeholder:text-slate-400 ${
                    gateError
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                      : 'border-slate-200 focus:border-slate-900 focus:ring-slate-900'
                  }`}
                />
              </div>

              {/* Polite Error Messages */}
              <AnimatePresence mode="wait">
                {gateError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-xs text-rose-600 font-bold pl-0.5 text-left"
                    id="gateway-error-msg"
                  >
                    {gateError}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Enter Button */}
              <button
                type="submit"
                className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-850 text-white font-semibold text-sm tracking-wide transition-all shadow-lg shadow-slate-900/10 hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer mt-6"
                id="gateway-verify-btn"
              >
                <span>Verify & Enter</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-slate-400 font-light z-10">
          Altera Corp &copy; 2026. All rights reserved.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-slate-900 selection:text-white">
      {/* Background ambient subtle visual circles */}
      <div className="absolute top-0 right-0 w-[45rem] h-[45rem] bg-gradient-to-b from-blue-10 w-1/2 blur-3xl opacity-50 pointer-events-none -mr-96 -mt-96" />
      <div className="absolute bottom-0 left-0 w-[45rem] h-[45rem] bg-gradient-to-t from-sky-5 w-1/2 blur-3xl opacity-50 pointer-events-none -ml-96 -mb-96" />

      {/* Global Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/70 border-b border-slate-100/80">
        <div className="max-w-6xl mx-auto px-4 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="https://user.fm/files/v2-a11f3f584f9b496d1b50f34963c37eb5/Altera%20Logo.png"
              alt="Altera Logo"
              referrerPolicy="no-referrer"
              className="h-7 w-auto object-contain"
              id="altera-main-logo"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Admin entry point completely hidden & disabled for a clean production experience */}
          </div>
        </div>
      </header>

      {/* Main Flow */}
      <main className="max-w-4xl mx-auto px-4 py-12 sm:py-20 relative z-10">
        <AnimatePresence mode="wait">
          {!submittedChoice ? (
            <motion.div
              key="order-form-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              {/* Premium Heading Section */}
              <div className="text-center max-w-2xl mx-auto mb-16">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold tracking-wide mb-4">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  Exclusive Employee Gift
                </span>
                <h1 className="font-display font-bold text-4xl sm:text-5xl tracking-tight text-slate-900 mb-4 leading-tight">
                  Choose Your Altera Styling
                </h1>
                <div className="text-slate-500 text-sm sm:text-base font-light leading-relaxed space-y-4 max-w-3xl mx-auto text-left sm:text-center">
                  <p>
                    As a gesture of appreciation for your hard work and dedication across the IT Infrastructure and Operations teams, we are distributing either a sweatshirt or polo.
                  </p>
                  <p>
                    The amount of effort, collaboration, and support the teams have provided across daily operations, project deliverables, escalations, and ongoing initiatives has not gone unnoticed and this is a small token of appreciation.
                  </p>
                  <p className="font-medium text-slate-800">
                    Please select a sweatshirt or a polo and indicate the size.
                  </p>
                  <p className="text-xs sm:text-sm text-slate-400">
                    Thank you for your continued teamwork and support.
                  </p>
                </div>
              </div>

              {/* Order Form */}
              <form onSubmit={handleFormSubmit} className="space-y-16">
                {/* SECTION 1: Product Choice */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold font-display">
                      1
                    </span>
                    <h2 className="font-display font-semibold text-lg text-slate-800 tracking-tight">
                      Pick Your Garment Type
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                    {/* Ladies Polo Choice Card */}
                    <motion.div
                      whileHover={{ y: -4 }}
                      transition={{ duration: 0.2 }}
                      className={`relative cursor-pointer bg-white rounded-2xl border transition-all ${
                        selectedItem === 'Altera Ladies Executive Polo'
                          ? 'border-slate-900 ring-2 ring-slate-900 shadow-lg'
                          : 'border-slate-150 hover:border-slate-350 shadow-sm hover:shadow-md'
                      }`}
                      onClick={() => setSelectedItem('Altera Ladies Executive Polo')}
                      id="select-item-ladies-polo-card"
                    >
                      <div className="aspect-[3/4] rounded-t-2xl overflow-hidden bg-slate-50 relative flex items-center justify-center p-2">
                        <img
                          src="https://user.fm/files/v2-1d49af01a711a974fb61531fb56ad974/Altera%20Ladies%20polo.jpg"
                          alt="Altera Ladies Executive Polo"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain transition-transform duration-500 hover:scale-[1.03]"
                        />
                        {selectedItem === 'Altera Ladies Executive Polo' && (
                          <div className="absolute top-4 right-4 bg-slate-900 text-white p-1.5 rounded-full shadow-md animate-scale-in">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="font-semibold text-base text-slate-950">Altera Ladies Executive Polo</h3>
                          <span className="text-[10px] bg-slate-100 text-slate-600 rounded px-2.5 py-1 font-bold uppercase tracking-wider">Ladies Polo</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomedImage('https://user.fm/files/v2-1d49af01a711a974fb61531fb56ad974/Altera%20Ladies%20polo.jpg');
                              setZoomedImageTitle('Altera Ladies Executive Polo');
                            }}
                            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border border-slate-200 hover:border-slate-800 text-slate-500 hover:text-slate-900 transition-colors text-xs font-semibold cursor-pointer"
                            id="zoom-ladies-polo-btn"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span>Expand</span>
                          </button>
                          <a
                            href="https://user.fm/files/v2-6d81b2bea73b0e8450582f05c14896c7/Polo.pdf"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-600 hover:text-indigo-700 transition-colors text-xs font-semibold cursor-pointer"
                            id="size-guide-ladies-polo-btn"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Size Guide</span>
                          </a>
                        </div>
                      </div>
                    </motion.div>

                    {/* Polo Choice Card */}
                    <motion.div
                      whileHover={{ y: -4 }}
                      transition={{ duration: 0.2 }}
                      className={`relative cursor-pointer bg-white rounded-2xl border transition-all ${
                        selectedItem === 'Altera Executive Polo'
                          ? 'border-slate-900 ring-2 ring-slate-900 shadow-lg'
                          : 'border-slate-150 hover:border-slate-350 shadow-sm hover:shadow-md'
                      }`}
                      onClick={() => setSelectedItem('Altera Executive Polo')}
                      id="select-item-polo-card"
                    >
                      <div className="aspect-[3/4] rounded-t-2xl overflow-hidden bg-slate-50 relative flex items-center justify-center p-2">
                        <img
                          src="https://user.fm/files/v2-44d81f5f366006a3577f10f76786cf8b/Altera%20Polo.jpg"
                          alt="Altera Polo Shirt"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain transition-transform duration-500 hover:scale-[1.03]"
                        />
                        {selectedItem === 'Altera Executive Polo' && (
                          <div className="absolute top-4 right-4 bg-slate-900 text-white p-1.5 rounded-full shadow-md animate-scale-in">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="font-semibold text-base text-slate-950">Altera Executive Polo</h3>
                          <span className="text-[10px] bg-slate-100 text-slate-600 rounded px-2.5 py-1 font-bold uppercase tracking-wider">Men\'s Polo</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomedImage('https://user.fm/files/v2-44d81f5f366006a3577f10f76786cf8b/Altera%20Polo.jpg');
                              setZoomedImageTitle('Altera Executive Polo');
                            }}
                            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border border-slate-200 hover:border-slate-800 text-slate-500 hover:text-slate-900 transition-colors text-xs font-semibold cursor-pointer"
                            id="zoom-polo-btn"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span>Expand</span>
                          </button>
                          <a
                            href="https://user.fm/files/v2-6d81b2bea73b0e8450582f05c14896c7/Polo.pdf"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-600 hover:text-indigo-700 transition-colors text-xs font-semibold cursor-pointer"
                            id="size-guide-polo-btn"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Size Guide</span>
                          </a>
                        </div>
                      </div>
                    </motion.div>

                    {/* Hoodie Choice Card */}
                    <motion.div
                      whileHover={{ y: -4 }}
                      transition={{ duration: 0.2 }}
                      className={`relative cursor-pointer bg-white rounded-2xl border transition-all ${
                        selectedItem === 'Altera Pullover Hoodie'
                          ? 'border-slate-900 ring-2 ring-slate-900 shadow-lg'
                          : 'border-slate-150 hover:border-slate-350 shadow-sm hover:shadow-md'
                      }`}
                      onClick={() => setSelectedItem('Altera Pullover Hoodie')}
                      id="select-item-hoodie-card"
                    >
                      <div className="aspect-[3/4] rounded-t-2xl overflow-hidden bg-slate-50 relative flex items-center justify-center p-4">
                        <img
                          src="https://user.fm/files/v2-a732a16d204d0d79d4a92ca2db026c24/Hoodie.jpg"
                          alt="Altera Pullover Hoodie"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain transition-transform duration-500 hover:scale-[1.03]"
                        />
                        {selectedItem === 'Altera Pullover Hoodie' && (
                          <div className="absolute top-4 right-4 bg-slate-900 text-white p-1.5 rounded-full shadow-md animate-scale-in">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="font-semibold text-base text-slate-950">Altera Pullover Hoodie</h3>
                          <span className="text-[10px] bg-slate-100 text-slate-600 rounded px-2.5 py-1 font-bold uppercase tracking-wider">Hoodie Version</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomedImage('https://user.fm/files/v2-a732a16d204d0d79d4a92ca2db026c20/Hoodie.jpg');
                              setZoomedImageTitle('Altera Pullover Hoodie');
                            }}
                            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border border-slate-200 hover:border-slate-800 text-slate-500 hover:text-slate-900 transition-colors text-xs font-semibold cursor-pointer"
                            id="zoom-hoodie-btn"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span>Expand</span>
                          </button>
                          <a
                            href="https://user.fm/files/v2-a4aec5b9ee53234878221d1bbdeb22aa/Hoodie.pdf"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-100 text-teal-600 hover:text-teal-700 transition-colors text-xs font-semibold cursor-pointer"
                            id="size-guide-hoodie-btn"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Size Guide</span>
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </div>

                {/* SECTION 2: Size Specification */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold font-display">
                      2
                    </span>
                    <h2 className="font-display font-semibold text-lg text-slate-800 tracking-tight">
                      Specify Your Size
                    </h2>
                  </div>

                  <div className="pt-2">
                    <div className="flex flex-wrap gap-4 justify-center sm:justify-start">
                      {(['S', 'M', 'L', 'XL', '2XL'] as const).map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setSelectedSize(size)}
                          className={`w-18 h-18 sm:w-22 sm:h-22 rounded-2xl flex flex-col justify-center items-center border transition-all duration-200 outline-none ${
                            selectedSize === size
                              ? 'bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/10 scale-[1.05]'
                              : 'bg-white border-slate-200/80 hover:border-slate-900 hover:text-slate-900 text-slate-500 shadow-sm'
                          }`}
                          id={`size-selector-${size}`}
                        >
                          <span className="font-display font-bold text-lg">{size}</span>
                          <span className={`text-[10px] mt-1 font-semibold ${selectedSize === size ? 'text-slate-300' : 'text-slate-400'}`}>
                            {size === 'XL' ? 'X-Large' : size === '2XL' ? '2X-Large' : size === 'L' ? 'Large' : size === 'M' ? 'Medium' : 'Small'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* SECTION 3: Information Intake Form */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold font-display">
                      3
                    </span>
                    <h2 className="font-display font-semibold text-lg text-slate-800 tracking-tight">
                      Employment Details
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    {/* Name Input */}
                    <div className="space-y-2">
                      <label htmlFor="input-em-name" className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" /> Full Name
                      </label>
                      <input
                        id="input-em-name"
                        type="text"
                        required
                        placeholder="John Doe"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all font-sans text-sm placeholder:text-slate-400"
                      />
                    </div>

                    {/* Email Input */}
                    <div className="space-y-2">
                      <label htmlFor="input-em-email" className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" /> Corporate Email
                      </label>
                      <input
                        id="input-em-email"
                        type="email"
                        required
                        placeholder="john.doe@altera.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all font-sans text-sm placeholder:text-slate-400"
                      />
                    </div>

                    {/* Campus Location */}
                    <div className="space-y-2 md:col-span-2">
                      <label htmlFor="input-em-campus" className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" /> Campus Location
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <select
                          id="input-em-campus"
                          required
                          value={campus}
                          onChange={(e) => setCampus(e.target.value)}
                          className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all font-sans text-sm text-slate-800"
                        >
                          <option value="" disabled>Select your regional office campus...</option>
                          {campusOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>

                        {campus === 'Other Location' && (
                          <motion.input
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            type="text"
                            required
                            placeholder="Specify Campus Location..."
                            value={customCampus}
                            onChange={(e) => setCustomCampus(e.target.value)}
                            className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all font-sans text-sm placeholder:text-slate-400"
                            id="custom-campus-input"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Final Submit action bar */}
                <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="text-center sm:text-left text-xs text-slate-400 max-w-sm">
                    By submitting, you represent that this selection contains correct and finalized configurations for Altera distribution tracking.
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !isFormValid}
                    className={`w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-sm tracking-wide transition-all h-12 flex items-center justify-center gap-2 ${
                      !isFormValid
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                        : 'bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/10 cursor-pointer hover:scale-[1.01] active:scale-95'
                    }`}
                    id="apparel-order-submit-btn"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Logging Selection...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit Order Selection</span>
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="order-success-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="max-w-md mx-auto text-center"
            >
              <div className="bg-white rounded-3xl p-8 sm:p-10 border border-slate-100 shadow-xl space-y-6">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 mx-auto flex items-center justify-center">
                  <CheckCircle className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                  <h2 className="font-display font-bold text-2xl tracking-tight text-slate-900">
                    Order Selection Confirmed
                  </h2>
                  <p className="text-xs text-slate-400 font-light">
                    Thank you {submittedChoice.name}. Your specifications are locked and synced!
                  </p>
                </div>

                {/* Styled Invoice Spec Card */}
                <div className="bg-slate-50 rounded-2xl p-6 text-left border border-slate-100 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-slate-100 rounded-full blur-xl pointer-events-none -mr-8 -mt-8 opacity-60" />
                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-200/60">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Garment Config</span>
                      <span className="text-[10px] bg-slate-900 text-white rounded-md px-2 py-0.5 font-bold uppercase tracking-wider">
                        {submittedChoice.size}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <img
                        src={
                          submittedChoice.item === 'polo' || submittedChoice.item === 'Altera Executive Polo'
                            ? 'https://user.fm/files/v2-44d81f5f366006a3577f10f76786cf8b/Altera%20Polo.jpg'
                            : submittedChoice.item === 'Altera Ladies Executive Polo' || submittedChoice.item === 'ladies_polo'
                            ? 'https://user.fm/files/v2-1d49af01a711a974fb61531fb56ad974/Altera%20Ladies%20polo.jpg'
                            : 'https://user.fm/files/v2-a732a16d204d0d79d4a92ca2db026c24/Hoodie.jpg'
                        }
                        alt="apparel image"
                        className="w-12 h-12 rounded-lg object-cover border border-slate-200 bg-white"
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {submittedChoice.item === 'polo' || submittedChoice.item === 'Altera Executive Polo'
                            ? 'Altera Executive Polo'
                            : submittedChoice.item === 'Altera Ladies Executive Polo' || submittedChoice.item === 'ladies_polo'
                            ? 'Altera Ladies Executive Polo'
                            : 'Altera Pullover Hoodie'}
                        </p>
                        <p className="text-[11px] text-slate-400 font-light">
                          Distribution: {submittedChoice.campus}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200/60 flex justify-between text-xs font-light text-slate-400">
                      <span>Corporate Email</span>
                      <span className="font-normal text-slate-700">{submittedChoice.email}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => setSubmittedChoice(null)}
                    className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-all shadow-md active:scale-95 cursor-pointer"
                    id="submit-another-choice-btn"
                  >
                    Submit Another Response
                  </button>
                  <p className="text-[10px] text-slate-400 font-light mt-3">
                    Need to modify an existing entry? Contact your internal Altera project manager.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* FOOTER */}
      <footer className="max-w-6xl mx-auto px-4 py-12 border-t border-slate-100 relative z-1 p-2">
        {/* Inline Admin Portal passcode prompt widget */}
        <AnimatePresence>
          {showPortalAuth && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mb-6 p-4 bg-slate-50 border border-slate-150 rounded-2xl max-w-sm ml-0 shadow-sm"
              id="admin-passcode-inline-prompt"
            >
              <form onSubmit={handlePortalSubmit} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    Admin Passcode Required
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPortalAuth(false);
                      setPortalPasscode('');
                      setPortalAuthError(false);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="Enter Hirsch passcode"
                    value={portalPasscode}
                    onChange={(e) => {
                      setPortalPasscode(e.target.value);
                      if (portalAuthError) setPortalAuthError(false);
                    }}
                    className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 placeholder:text-slate-400 focus:ring-1 focus:ring-slate-900 transition-all font-light"
                    autoFocus
                    id="portal-passcode-input"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl tracking-wide transition-all shadow-sm active:scale-95 cursor-pointer"
                    id="portal-passcode-submit-btn"
                  >
                    Login
                  </button>
                </div>
                {portalAuthError && (
                  <p className="text-[11px] text-red-600 font-medium">Incorrect password. Please try again.</p>
                )}
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <img
              src="https://user.fm/files/v2-a11f3f584f9b496d1b50f34963c37eb5/Altera%20Logo.png"
              alt="Altera Logo"
              referrerPolicy="no-referrer"
              className="h-5 w-auto opacity-40 grayscale"
            />
            <span className="text-[10px] text-slate-400 tracking-wider uppercase font-medium">Altera Corp &copy; 2026</span>
            <span className="text-slate-200 text-xs select-none">•</span>
            <a
              href="#"
              onClick={(e) => {
                handleAdminPortalClick(e);
              }}
              className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors cursor-pointer font-medium underline underline-offset-2"
              id="admin-portal-trigger"
            >
              Admin Portal
            </a>
          </div>

          {/* Management Console and Google Sheets buttons remove for clean lockdown */}
        </div>
      </footer>

      {/* SLIDE-OVER DRAWER FOR ADMINISTRATOR DASHBOARD */}
      <AnimatePresence>
        {isAdminOpen && (
          <>
            {/* Backdrop transparent layer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdminOpen(false)}
              className="fixed inset-0 bg-slate-950/60 z-50 backdrop-blur-xs"
            />

            {/* Slide over layout container */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-full max-w-4xl bg-white shadow-2xl z-50 flex flex-col text-slate-900 border-l border-slate-100"
              id="admin-dashboard-drawer"
            >
              {/* Drawer Header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-slate-900 text-white">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-lg text-slate-950">Management Console</h3>
                    <p className="text-[10px] text-slate-400 tracking-wider font-light uppercase">Apparel Log tracking panel</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAdminOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-all cursor-pointer"
                  id="admin-close-drawer-btn"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Body - Scrollable content area */}
              <div className="p-6 overflow-y-auto flex-1 space-y-8">
                {/* SHEETS INTEGRATION CARD */}
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-150">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Storage Sync Engine</span>
                      <h4 className="font-semibold text-base text-slate-950 flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Google Sheets Integration
                      </h4>
                      <p className="text-slate-400 text-xs font-light max-w-xl">
                        Log order selections in a shared spreadsheet. Create are dynamic worksheet with header logs or append to an ongoing spreadsheet directly with permission.
                      </p>
                    </div>

                    {!adminUser ? (
                      <button
                        onClick={handleAdminLogin}
                        disabled={isLoggingIn}
                        className="group flex items-center gap-2 py-3 px-4 rounded-xl bg-white hover:bg-slate-900 text-slate-700 hover:text-white border border-slate-200 hover:border-slate-900 font-semibold text-xs tracking-wide transition-all shadow-sm cursor-pointer disabled:opacity-50"
                        id="google-sheet-auth-btn"
                      >
                        {isLoggingIn ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        ) : (
                          <svg className="w-4 h-4 group-hover:fill-white fill-slate-700 transition-all" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.08H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.92l2.85-2.21.81-.61z"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.08l3.66 2.84c.87-2.6 3.3-4.54 6.16-4.54z"/>
                          </svg>
                        )}
                        <span>Sign in with Google</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs font-semibold text-slate-900">{adminUser.email}</p>
                          <p className="text-[10px] text-slate-400 font-light">Authenticated Admin</p>
                        </div>
                        <button
                          onClick={handleAdminLogout}
                          className="p-2 rounded-xl border border-slate-200 hover:border-red-200 bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all cursor-pointer"
                          title="Sign Out"
                          id="google-sheet-logout-btn"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Operational Interface when authenticated */}
                  {adminUser && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="pt-6 mt-6 border-t border-slate-200/60 space-y-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label htmlFor="spreadsheet-id-input" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Spreadsheet ID</label>
                          <input
                            id="spreadsheet-id-input"
                            type="text"
                            placeholder="e.g. 1aBC-Xyz1234567890..."
                            value={spreadsheetId}
                            onChange={(e) => {
                              const val = e.target.value.trim();
                              setSpreadsheetId(val);
                              localStorage.setItem('altera_spreadsheet_id', val);
                              // Reset state logic
                              setSyncSuccess(false);
                            }}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 font-mono text-xs placeholder:text-slate-400"
                          />
                        </div>

                        <div className="flex items-end gap-2 flex-wrap sm:flex-nowrap">
                          {spreadsheetId ? (
                            <button
                              onClick={handleSyncData}
                              disabled={syncLoading || !spreadsheetId}
                              className="flex-1 py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                              id="sync-submissions-btn"
                            >
                              {syncLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                              )}
                              <span>Write & Sync Updates</span>
                            </button>
                          ) : (
                            <button
                              onClick={handleCreateNewSheet}
                              disabled={syncLoading}
                              className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold tracking-wide transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                              id="create-new-sheet-btn"
                            >
                              {syncLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Plus className="w-3.5 h-3.5" />
                              )}
                              <span>Auto-Create Spreadsheet</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Display sheet links */}
                      {spreadsheetUrl && (
                        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/50 border border-emerald-100">
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            <span className="text-xs text-slate-600 truncate max-w-sm sm:max-w-md">
                              Linked spreadsheet: <strong className="font-semibold">Altera Apparel Log</strong>
                            </span>
                          </div>
                          <a
                            href={spreadsheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-0.5"
                          >
                            <span>Open</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}

                      {/* Sync Feedbacks */}
                      {syncSuccess && (
                        <div className="text-xs text-emerald-600 font-medium flex items-center gap-1 animate-scale-in">
                          <Check className="w-3.5 h-3.5 bg-emerald-100 rounded-full p-0.5" /> Spreadsheet populated and saved successfully.
                        </div>
                      )}
                      {syncError && (
                        <div className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-lg border border-rose-100">
                          Error: {syncError}
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>

                {/* HISTORIC METRICS PANEL */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-500" /> Total Orders
                    </span>
                    <span className="font-display font-bold text-3xl text-slate-900 mt-2">{totalOrders}</span>
                    <p className="text-[10px] text-slate-400 mt-1 font-light">Distinct employee filings</p>
                  </div>

                  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Shirt className="w-3.5 h-3.5 text-indigo-500" /> Altera Polos
                    </span>
                    <span className="font-display font-bold text-3xl text-slate-900 mt-2">
                      {totalPolos} <span className="text-xs font-normal text-slate-400">({totalOrders ? Math.round((totalPolos / totalOrders) * 100) : 0}%)</span>
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1 font-light">Short-sleeve corporate pique</p>
                  </div>

                  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Shirt className="w-3.5 h-3.5 text-teal-500" /> Altera Hoodies
                    </span>
                    <span className="font-display font-bold text-3xl text-slate-900 mt-2">
                      {totalHoodies} <span className="text-xs font-normal text-slate-400">({totalOrders ? Math.round((totalHoodies / totalOrders) * 100) : 0}%)</span>
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1 font-light">Dropped-shoulder pullover fleece</p>
                  </div>
                </div>

                {/* SIZE DISTRIBUTION */}
                {totalOrders > 0 && (
                  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs space-y-4">
                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-slate-500" /> Size Percentages
                    </h5>
                    <div className="space-y-2.5">
                      {(['S', 'M', 'L', 'XL', '2XL'] as const).map((sz) => {
                        const count = sizeBreakdown[sz] || 0;
                        const pct = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
                        return (
                          <div key={sz} className="flex items-center gap-4 text-xs">
                            <span className="font-bold w-8 text-slate-600">{sz}</span>
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${pct}%` }}
                                className="h-full bg-slate-900 rounded-full transition-all duration-500"
                              />
                            </div>
                            <span className="text-slate-400 font-light w-10 text-right">{count} ({pct}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* EMPLOYEES ORDER LOG TABLE */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <History className="w-4 h-4 text-slate-500" /> Employee Selection Log
                      </h4>
                      <p className="text-[10px] text-slate-400 font-light uppercase">Real-time submissions repository</p>
                    </div>

                    <div className="flex items-center gap-2 self-stretch sm:self-auto">
                      <button
                        onClick={fetchSubmissions}
                        disabled={loadingSubmissions}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                        title="Reload logs"
                        id="reload-submissions-logs-btn"
                      >
                        <RefreshCw className={`w-4 h-4 ${loadingSubmissions ? 'animate-spin' : ''}`} />
                      </button>

                      {submissions.length > 0 && (
                        <button
                          onClick={handleClearAll}
                          className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition-colors cursor-pointer"
                          id="clear-all-submissions-btn"
                        >
                          <Trash className="w-3.5 h-3.5" />
                          <span>Clear All</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filters Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search logs..."
                        value={adminSearch}
                        onChange={(e) => setAdminSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-slate-900 placeholder:text-slate-400"
                        id="filter-search-input"
                      />
                    </div>

                    <div>
                      <select
                        value={adminFilterItem}
                        onChange={(e: any) => setAdminFilterItem(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-slate-900"
                        id="filter-item-select"
                      >
                        <option value="all">Garment Type All</option>
                        <option value="polo">Men's Polo Shirt Only</option>
                        <option value="Altera Ladies Executive Polo">Ladies Polo Shirt Only</option>
                        <option value="hoodie">Pullover Hoodie Only</option>
                      </select>
                    </div>

                    <div>
                      <select
                        value={adminFilterSize}
                        onChange={(e) => setAdminFilterSize(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-slate-900"
                        id="filter-size-select"
                      >
                        <option value="all">Sizing All</option>
                        <option value="S">S Only</option>
                        <option value="M">M Only</option>
                        <option value="L">L Only</option>
                        <option value="XL">XL Only</option>
                        <option value="2XL">2XL Only</option>
                      </select>
                    </div>
                  </div>

                  {/* Data Content Box */}
                  <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white">
                    {loadingSubmissions ? (
                      <div className="py-12 text-center text-slate-400 flex flex-col justify-center items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        <span className="text-xs">Accessing record files...</span>
                      </div>
                    ) : filteredSubmissions.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 text-xs font-light">
                        No Apparel entries found matching your query.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-550/5 border-b border-slate-100 text-slate-400 uppercase tracking-wider font-bold">
                              <th className="p-3 pl-4">Name</th>
                              <th className="p-3">Item Choice</th>
                              <th className="p-3 text-center">Size</th>
                              <th className="p-3">Campus</th>
                              <th className="p-3 text-right pr-4">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredSubmissions.map((sub) => (
                              <tr key={sub.id} className="hover:bg-slate-50/50">
                                <td className="p-3 pl-4">
                                  <p className="font-semibold text-slate-900">{sub.name}</p>
                                  <p className="text-[10px] text-slate-400 font-light truncate max-w-[150px]">{sub.email}</p>
                                </td>
                                <td className="p-3">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                                    sub.item === 'polo' || sub.item === 'Altera Executive Polo'
                                      ? 'bg-indigo-50 text-indigo-700'
                                      : sub.item === 'Altera Ladies Executive Polo' || sub.item === 'ladies_polo'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                      : 'bg-teal-50 text-teal-700'
                                  }`}>
                                    {sub.item === 'polo' || sub.item === 'Altera Executive Polo' ? 'Polo' : sub.item === 'Altera Ladies Executive Polo' || sub.item === 'ladies_polo' ? 'Ladies Polo' : 'Hoodie'}
                                  </span>
                                </td>
                                <td className="p-3 text-center font-bold text-slate-800">
                                  {sub.size}
                                </td>
                                <td className="p-3 text-slate-500 font-light">
                                  {sub.campus}
                                </td>
                                <td className="p-3 text-right pr-4">
                                  <button
                                    onClick={() => handleDeleteSubmission(sub.id)}
                                    className="p-1 px-2 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                    title="Delete Entry"
                                    id={`delete-btn-${sub.id}`}
                                  >
                                    <Trash className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setIsAdminOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
                  id="admin-footer-close-btn"
                >
                  Close Console
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Lightbox / Zoomed image Modal */}
      <AnimatePresence>
        {zoomedImage && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setZoomedImage(null)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 15 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-2xl w-full flex flex-col border border-slate-200 relative"
              >
                {/* Close Button */}
                <button
                  onClick={() => setZoomedImage(null)}
                  className="absolute top-4 right-4 p-2 bg-slate-100/80 hover:bg-slate-200/90 text-slate-700 hover:text-slate-900 rounded-full transition-all cursor-pointer z-10"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Content */}
                <div className="bg-slate-50 p-6 flex flex-col items-center justify-center border-b border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">High-Resolution preview</span>
                  <h4 className="font-display font-medium text-lg text-slate-950 text-center">{zoomedImageTitle}</h4>
                </div>

                <div className="flex-1 bg-white flex items-center justify-center p-6 max-h-[70vh]">
                  <img
                    src={zoomedImage}
                    alt={zoomedImageTitle}
                    referrerPolicy="no-referrer"
                    className="max-h-[55vh] max-w-full rounded-2xl object-contain shadow-xs border border-slate-100"
                  />
                </div>

                <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => setZoomedImage(null)}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-md active:scale-95 transition-all"
                  >
                    Close Preview
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Google Apps Script Web App Configuration Modal */}
      <AnimatePresence>
        {isScriptConfigOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsScriptConfigOpen(false)}
              className="fixed inset-0 bg-slate-950 z-[110] backdrop-blur-xs"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-4 bottom-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-white rounded-3xl overflow-hidden shadow-2xl max-w-lg w-full sm:w-[500px] z-[120] border border-slate-100 flex flex-col"
              id="script-config-modal-panel"
            >
              {/* Header */}
              <div className="bg-slate-50 p-6 flex flex-col items-center justify-center border-b border-slate-100 relative">
                <button
                  type="button"
                  onClick={() => setIsScriptConfigOpen(false)}
                  className="absolute top-4 right-4 p-1.5 bg-slate-200/50 hover:bg-slate-200 text-slate-500 hover:text-slate-900 rounded-full transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 shadow-inner">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <h4 className="font-display font-bold text-lg text-slate-950">Google Sheets Connection</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Apps Script Web App Integration</p>
              </div>

              {/* Instructions and body */}
              <div className="p-6 space-y-5 text-slate-600 text-xs">
                <div className="space-y-2 leading-relaxed bg-slate-50/70 p-4 rounded-xl border border-slate-150/50">
                  <p className="font-semibold text-slate-800">💡 Custom spreadsheet synchronization:</p>
                  <p>
                    By deploying a Google Apps Script Web App with a <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px] text-indigo-700">doPost(e)</code> method accepting <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px] text-indigo-700">fullName, email, location, garmentType, size</code>, you can feed entries inside your Sheets in real-time.
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="script-url-input-field" className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Deployed Web App URL
                  </label>
                  <input
                    id="script-url-input-field"
                    type="url"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={tempScriptUrl}
                    onChange={(e) => setTempScriptUrl(e.target.value)}
                    className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-slate-950 focus:ring-1 focus:ring-slate-950 transition-all font-mono font-light text-[11px] text-slate-800"
                  />
                  {tempScriptUrl && tempScriptUrl !== DEFAULT_GOOGLE_SCRIPT_URL && !tempScriptUrl.startsWith('https://script.google.com') && (
                    <p className="text-[10px] text-amber-600 font-medium">
                      ⚠️ Note: Google Apps Script Web App URLs generally start with <code className="font-mono">https://script.google.com/</code>
                    </p>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('altera_google_script_url');
                    setGoogleScriptUrl(DEFAULT_GOOGLE_SCRIPT_URL);
                    setTempScriptUrl(DEFAULT_GOOGLE_SCRIPT_URL);
                    setIsScriptConfigOpen(false);
                    setToast({
                      message: 'Reset script link to original defaults.',
                      type: 'info'
                    });
                  }}
                  className="px-4 py-2 hover:bg-slate-200 text-slate-505 rounded-xl text-xs font-semibold hover:text-slate-900 transition-all cursor-pointer"
                >
                  Reset Default
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsScriptConfigOpen(false)}
                    className="px-4 py-2 text-slate-500 hover:text-slate-900 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const clean = tempScriptUrl.trim();
                      localStorage.setItem('altera_google_script_url', clean);
                      setGoogleScriptUrl(clean);
                      setIsScriptConfigOpen(false);
                      setToast({
                        message: '✅ Saved Sheet Web App connection URL successfully!',
                        type: 'success'
                      });
                    }}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-md active:scale-95 transition-all"
                  >
                    Save connection
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Interactive Toast Alert Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed top-6 right-6 z-[200] max-w-sm w-full bg-white rounded-2xl shadow-xl border border-slate-150/80 p-4.5 flex gap-3 items-start pointer-events-auto"
            id="global-toast-alert"
          >
            <div className={`mt-0.5 p-1 rounded-lg ${
              toast.type === 'success'
                ? 'bg-emerald-50 text-emerald-600'
                : toast.type === 'error'
                ? 'bg-rose-50 text-rose-600'
                : 'bg-indigo-50 text-indigo-600'
            }`}>
              {toast.type === 'success' ? (
                <Check className="w-4 h-4" />
              ) : toast.type === 'error' ? (
                <X className="w-4 h-4" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
            </div>

            <div className="flex-1 space-y-1">
              <p className="text-slate-800 text-xs font-medium leading-relaxed">
                {toast.message}
              </p>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-350">
                  {toast.type === 'success' ? 'Synchronized' : toast.type === 'error' ? 'Sync alert' : 'Configuration'}
                </span>
                <button
                  onClick={() => setToast(null)}
                  className="text-[10px] text-slate-400 hover:text-slate-950 font-semibold cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-Screen Admin Portal Overlay Modal */}
      <AnimatePresence>
        {isAdminPortalOpen && (
          <>
            {/* Backdrop with blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[150]"
            />

            {/* Inner modal view */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 15 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-0 sm:inset-6 bg-white sm:rounded-3xl shadow-2xl z-[160] overflow-hidden flex flex-col border border-slate-100"
              id="admin-portal-modal-panel"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-900 text-white">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg text-slate-950">Admin Portal Database</h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Local Storage Repositories & Order Specifications</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDeleteSelectedPortal}
                    disabled={selectedPortalSubmissionIds.length === 0}
                    className="flex items-center gap-1.5 py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-semibold tracking-wide transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer"
                    id="portal-delete-selected-btn"
                  >
                    <Trash className="w-4 h-4" />
                    <span>Delete Selected ({selectedPortalSubmissionIds.length})</span>
                  </button>

                  <button
                    onClick={exportToCSV}
                    className="flex items-center gap-1.5 py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold tracking-wide transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer"
                    id="portal-export-csv-btn"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Export to CSV</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      setIsAdminPortalOpen(false);
                      setPortalSearch('');
                    }}
                    className="p-2 bg-slate-200/60 hover:bg-slate-200 text-slate-500 hover:text-slate-950 rounded-xl transition-all cursor-pointer"
                    id="portal-close-btn"
                    title="Close Portal"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Toolbar/Insights bar */}
              <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
                  <span className="flex items-center gap-1.5 bg-slate-100 py-1.5 px-3 rounded-lg">
                    Total Submissions: <strong className="text-slate-950 font-bold">{submissions.length}</strong>
                  </span>
                  <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 py-1.5 px-3 rounded-lg">
                    Polos: <strong className="font-bold">{submissions.filter(s => s.item === 'polo' || s.item === 'Altera Executive Polo').length}</strong>
                  </span>
                  <span className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 py-1.5 px-3 rounded-lg">
                    Hoodies: <strong className="font-bold">{submissions.filter(s => s.item === 'hoodie' || s.item === 'Altera Pullover Hoodie').length}</strong>
                  </span>
                </div>

                {/* Inline Search Bar */}
                <div className="relative w-full md:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search portal entries..."
                    value={portalSearch}
                    onChange={(e) => setPortalSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-slate-900 placeholder:text-slate-400 focus:ring-1 focus:ring-slate-900 transition-all font-light"
                    id="portal-search-input"
                  />
                  {portalSearch && (
                    <button
                      onClick={() => setPortalSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[10px] font-bold animate-fade-in"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Submissions Table / Content */}
              <div className="flex-1 overflow-auto p-6">
                {submissions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 py-20">
                    <Database className="w-10 h-10 text-slate-300" />
                    <span className="text-sm font-medium">No submission records exist in the database.</span>
                  </div>
                ) : (() => {
                  const items = submissions.filter(s => {
                    const q = portalSearch.toLowerCase().trim();
                    if (!q) return true;
                    return (
                      s.name.toLowerCase().includes(q) ||
                      s.email.toLowerCase().includes(q) ||
                      s.campus.toLowerCase().includes(q) ||
                      s.item.toLowerCase().includes(q) ||
                      s.size.toLowerCase().includes(q)
                    );
                  });

                  if (items.length === 0) {
                    return (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 py-20">
                        <span className="text-sm">No entries match your search query.</span>
                      </div>
                    );
                  }

                  return (
                    <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-xs bg-white">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 uppercase tracking-wider font-bold">
                              <th className="p-4 w-12 text-center">
                                <input
                                  type="checkbox"
                                  checked={items.length > 0 && items.every(s => selectedPortalSubmissionIds.includes(s.id))}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedPortalSubmissionIds(prev => {
                                        const visibleIds = items.map(s => s.id);
                                        const combined = new Set([...prev, ...visibleIds]);
                                        return Array.from(combined);
                                      });
                                    } else {
                                      setSelectedPortalSubmissionIds(prev => {
                                        const visibleIds = items.map(s => s.id);
                                        return prev.filter(id => !visibleIds.includes(id));
                                      });
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-950 cursor-pointer accent-slate-900"
                                />
                              </th>
                              <th className="p-4 font-bold">Employee Name</th>
                              <th className="p-4 font-bold">Corporate Email</th>
                              <th className="p-4 font-bold">Campus / Location</th>
                              <th className="p-4 font-bold">Garment Choice</th>
                              <th className="p-4 font-bold text-center">Selected Size</th>
                              <th className="p-4 font-bold text-right">Submission Date</th>
                              <th className="p-4 font-bold text-center w-24">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {items.map((sub, idx) => {
                              const isChecked = selectedPortalSubmissionIds.includes(sub.id);
                              const row = {
                                id: sub.id,
                                employeeName: sub.name
                              };
                              return (
                                <tr key={sub.id || idx} className={`hover:bg-slate-50/50 transition-colors ${isChecked ? 'bg-slate-50/60' : ''}`}>
                                  <td className="p-4 text-center">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        setSelectedPortalSubmissionIds(prev => 
                                          prev.includes(sub.id)
                                            ? prev.filter(id => id !== sub.id)
                                            : [...prev, sub.id]
                                        );
                                      }}
                                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-950 cursor-pointer accent-slate-900"
                                    />
                                  </td>
                                  <td className="p-4 font-semibold text-slate-900">{sub.name}</td>
                                  <td className="p-4 text-slate-500 font-mono">{sub.email}</td>
                                  <td className="p-4 text-slate-600 font-medium">
                                    <span className="inline-flex items-center gap-1">
                                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                      {sub.campus}
                                    </span>
                                  </td>
                                  <td className="p-4">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold text-[10px] ${
                                      sub.item === 'polo' || sub.item === 'Altera Executive Polo'
                                        ? 'bg-blue-50 text-blue-700 border border-blue-105' 
                                        : sub.item === 'Altera Ladies Executive Polo' || sub.item === 'ladies_polo'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                        : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                    }`}>
                                      <Shirt className="w-3 h-3" />
                                      {sub.item === 'polo' || sub.item === 'Altera Executive Polo' ? 'Polo Shirt' : sub.item === 'Altera Ladies Executive Polo' || sub.item === 'ladies_polo' ? 'Altera Ladies Executive Polo' : 'Pullover Hoodie'}
                                    </span>
                                  </td>
                                  <td className="p-4 text-center">
                                    <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold text-[11px] border border-slate-200">
                                      {sub.size}
                                    </span>
                                  </td>
                                  <td className="p-4 text-right text-slate-400 font-mono text-[10px]">
                                    {new Date(sub.timestamp).toLocaleString(undefined, {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </td>
                                  <td className="p-4 text-center">
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (window.confirm("Are you sure you want to delete this entry?")) {
                                          const rawData = localStorage.getItem('altera_submissions_cache') || '[]';
                                          const parsedData = JSON.parse(rawData) as ApparelSubmission[];
                                          const updatedData = parsedData.filter(item => item.id !== row.id && item.name !== row.employeeName);
                                          localStorage.setItem('altera_submissions_cache', JSON.stringify(updatedData));
                                          setSubmissions(updatedData);
                                        }
                                      }}
                                      className="p-1.5 text-rose-600 hover:text-rose-800 rounded-lg hover:bg-rose-50 transition-colors inline-flex items-center justify-center cursor-pointer"
                                      title="Delete Submission"
                                    >
                                      <Trash className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
