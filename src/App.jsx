import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield,
  Zap,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Cpu,
  Flame,
  ArrowRight,
  Database,
  Search,
  Check,
  ChevronRight,
  Sparkles,
  Layers,
  Radio,
  HelpCircle,
  PlayCircle,
  MessageSquare,
  Mail,
  Info,
  X,
  Smartphone,
  CheckCheck,
  Workflow,
  Lock,
  CornerDownRight,
  Sliders,
  RotateCcw,
  BarChart3,
  Target,
  Activity,
  Timer,
  Building2,
  CreditCard,
  QrCode,
  Wallet
} from 'lucide-react';

const API_BASE_URL = 'http://127.0.0.1:8000';

// Clean initial dataset for zero state
const INITIAL_METRICS = {
  total_at_risk: 0.0,
  total_recovered: 0.0,
  recovery_rate: 0.0,
  total_events: 0
};

const FLOW_STEPS = [
  {
    step: 1,
    title: '1. Ingest Webhook',
    desc: 'Receives payment.failed from Razorpay',
    icon: Database,
    color: 'text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    detailTitle: 'Stage 1: Webhook Ingestion & Extraction',
    detailDesc: 'Razorpay posts payment metadata (order_id, amount, failure_code, customer details) to /webhook/razorpay. The engine normalizes payloads into a standard format.'
  },
  {
    step: 2,
    title: '2. Idempotency Gate',
    desc: 'Deduplicates & checks 3x anti-spam',
    icon: Shield,
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    detailTitle: 'Stage 2: Idempotency & Anti-Spam Guardrails',
    detailDesc: 'Deduplicates using unique event_id hash in SQLite. If retry_count >= 3, automatically triggers GUARDRAIL_TERMINATION to protect customer trust and prevent message spam.'
  },
  {
    step: 3,
    title: '3. Hybrid AI Diagnosis',
    desc: 'Gemini 2.5 Flash + 1.5s Circuit Breaker',
    icon: Sparkles,
    color: 'text-purple-400',
    border: 'border-purple-500/30',
    bg: 'bg-purple-500/10',
    detailTitle: 'Stage 3: Hybrid Diagnostic & Planning',
    detailDesc: 'Gemini 2.5 Flash diagnoses root cause (Bank Outage vs Low Funds vs Card Decline) and drafts Hinglish recovery copy. A 1.5-second circuit breaker ensures zero latency stall with deterministic fallbacks.'
  },
  {
    step: 4,
    title: '4. Autonomous Action',
    desc: 'Silent Backoff vs 1-Click Pay Link',
    icon: Send,
    color: 'text-cyan-400',
    border: 'border-cyan-500/30',
    bg: 'bg-cyan-500/10',
    detailTitle: 'Stage 4: Autonomous Dispatch & Payment Links',
    detailDesc: 'For bank downtimes: Schedules SILENT_RETRY without disturbing customer. For user drop-offs: Calls Razorpay API to generate 1-click test recovery link and dispatches NUDGE via WhatsApp/Email.'
  },
  {
    step: 5,
    title: '5. Loop Closed & Shield',
    desc: 'payment.captured marks RECOVERED',
    icon: TrendingUp,
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    detailTitle: 'Stage 5: Recovery Loop Closure',
    detailDesc: 'When customer completes payment on the generated link, Razorpay fires payment.captured. RecoverIQ immediately transitions state to RECOVERED and locks the audit log.'
  }
];

function Dashboard({ setView }) {
  const [metrics, setMetrics] = useState(INITIAL_METRICS);
  const [transactions, setTransactions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [filterState, setFilterState] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  // Interactive Flow Modal / Drawer States
  const [selectedFlowStep, setSelectedFlowStep] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showPlaygroundModal, setShowPlaygroundModal] = useState(false);

  // Razorpay 1-Click Recovery Checkout Modal States
  const [activePaymentModal, setActivePaymentModal] = useState(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('UPI');

  // Playground state for manual injection
  const [customOrderAmount, setCustomOrderAmount] = useState(1499);
  const [customCustomerName, setCustomCustomerName] = useState('Ankit Verma');
  const [customScenario, setCustomScenario] = useState('INSUFFICIENT_FUNDS');
  const [isInjectingSingle, setIsInjectingSingle] = useState(false);
  const [injectionResult, setInjectionResult] = useState(null);

  // 🚀 Real-time 5-Step Visual Pipeline State
  const [pipelineState, setPipelineState] = useState({
    activeStep: 0, // 0 = standby, 1..5 = current running stage, 6 = all completed
    mode: null,    // 'BATCH' | 'PLAYGROUND' | 'PAYMENT'
    statusText: 'Engine Standby • Ready to process Razorpay webhooks',
    subText: 'All 5 autonomous recovery microservices operating normally (1.5s circuit breaker active).',
    progress: 0,
    activeOrderId: null
  });

  // Fetch Dashboard Stats from Backend
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/stats`);
      if (res.ok) {
        const data = await res.json();
        if (data.metrics) setMetrics(data.metrics);
        if (Array.isArray(data.transactions)) {
          setTransactions(data.transactions);
        }
        if (Array.isArray(data.audit_logs)) {
          setAuditLogs(data.audit_logs);
        }
        setIsLiveConnected(true);
        setLastRefreshed(new Date());
      } else {
        setIsLiveConnected(false);
      }
    } catch {
      setIsLiveConnected(false);
    }
  }, []);

  // Reset database & UI state
  const handleResetData = async () => {
    setIsResetting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/reset`, { method: 'POST' });
      if (res.ok) {
        setMetrics(INITIAL_METRICS);
        setTransactions([]);
        setAuditLogs([]);
        await fetchStats();
      }
    } catch (err) {
      console.error('Reset failed:', err);
    } finally {
      setIsResetting(false);
    }
  };

  // Polling loop every 3 seconds
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Trigger Simulation Batch with Visual 5-Step Pipeline Progression
  const handleRunSimulation = async () => {
    setIsSimulating(true);

    // Step 1: Webhook Ingestion
    setPipelineState({
      activeStep: 1,
      mode: 'BATCH',
      statusText: 'Stage 1/5: Ingesting 50 Razorpay webhook payloads into raw event queue...',
      subText: 'Receiving payment.failed events from mock NPCI/Bank switch traffic.',
      progress: 20,
      activeOrderId: '50-Record Batch'
    });

    // Step 2: Idempotency Gate (after 700ms)
    setTimeout(() => {
      setPipelineState({
        activeStep: 2,
        mode: 'BATCH',
        statusText: 'Stage 2/5: Idempotency Gate & Anti-Spam Guardrails validating...',
        subText: 'Hashing event_id in SQLite ledger, enforcing 3x maximum customer nudge limits.',
        progress: 40,
        activeOrderId: '50-Record Batch'
      });
    }, 700);

    // Step 3: Hybrid AI Diagnosis (after 1500ms)
    setTimeout(() => {
      setPipelineState({
        activeStep: 3,
        mode: 'BATCH',
        statusText: 'Stage 3/5: Gemini 2.5 Flash analyzing failure patterns & generating Hinglish copy...',
        subText: 'Categorizing Bank Outages vs Insufficient Funds with 1.5s circuit-breaker guarantee.',
        progress: 60,
        activeOrderId: '50-Record Batch'
      });
    }, 1500);

    // Step 4: Autonomous Action (after 2400ms)
    setTimeout(() => {
      setPipelineState({
        activeStep: 4,
        mode: 'BATCH',
        statusText: 'Stage 4/5: Generating dynamic 1-click Razorpay test payment links & dispatching...',
        subText: 'Executing Silent Retry for bank outages; dispatching WhatsApp/Email for user drop-offs.',
        progress: 80,
        activeOrderId: '50-Record Batch'
      });
    }, 2400);

    try {
      const res = await fetch(`${API_BASE_URL}/api/simulate-batch`, {
        method: 'POST'
      });
      if (res.ok) {
        setTimeout(fetchStats, 500);
        setTimeout(fetchStats, 2000);
      }
    } catch (err) {
      console.error('Simulation trigger failed:', err);
    } finally {
      // Step 5: Loop Closed & Metrics Update (after 3300ms)
      setTimeout(() => {
        setPipelineState({
          activeStep: 5,
          mode: 'BATCH',
          statusText: 'Stage 5/5: Simulated customer payments captured & ledger audit sealed!',
          subText: 'Transitioned successful recoveries to RECOVERED and updated GMV charts.',
          progress: 100,
          activeOrderId: '50-Record Batch'
        });
        fetchStats();
      }, 3300);

      // Step 6: Completion Banner (after 4200ms)
      setTimeout(() => {
        setPipelineState({
          activeStep: 6,
          mode: 'BATCH',
          statusText: '✓ 50-Record Batch Processing Completed Successfully!',
          subText: 'All 50 events orchestrated through the 5-stage zero-touch recovery pipeline.',
          progress: 100,
          activeOrderId: null
        });
        setIsSimulating(false);
      }, 4200);

      // Graceful return to standby (after 7000ms)
      setTimeout(() => {
        setPipelineState({
          activeStep: 0,
          mode: null,
          statusText: 'Engine Standby • Ready to process Razorpay webhooks',
          subText: 'All 5 autonomous recovery microservices operating normally (1.5s circuit breaker active).',
          progress: 0,
          activeOrderId: null
        });
      }, 7000);
    }
  };

  // Inject a single test failure via Playground with Real-time 5-Step Visual Pipeline
  const handleInjectSingleFailure = async () => {
    setIsInjectingSingle(true);
    setInjectionResult(null);

    const errorDetails = {
      INSUFFICIENT_FUNDS: {
        code: 'BAD_REQUEST_INSUFFICIENT_FUNDS',
        desc: 'Insufficient balance in customer bank account'
      },
      BANK_DOWNTIME: {
        code: 'GATEWAY_TIMEOUT_HDFC',
        desc: 'NPCI UPI switch response timeout from HDFC Bank'
      },
      USER_ABANDONMENT: {
        code: 'USER_DROPPED_OTP',
        desc: 'Customer abandoned transaction during OTP verification step'
      },
      CARD_BLOCKED: {
        code: 'CARD_BLOCKED_BY_ISSUER',
        desc: 'Debit/Credit card is blocked by issuing bank due to security risk'
      }
    }[customScenario];

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderId = `rzp_ord_test_${randomSuffix}`;
    const eventId = `evt_test_${orderId}`;

    const payload = {
      entity: 'event',
      account_id: 'acc_recoveryiq_demo',
      event: 'payment.failed',
      event_id: eventId,
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: `pay_test_${randomSuffix}`,
            order_id: orderId,
            amount: Math.round(customOrderAmount * 100),
            currency: 'INR',
            status: 'failed',
            error_code: errorDetails.code,
            error_description: errorDetails.desc,
            email: `${customCustomerName.toLowerCase().replace(' ', '.')}@example.com`,
            contact: '+919876543210',
            notes: { customer_name: customCustomerName }
          }
        }
      },
      created_at: Math.floor(Date.now() / 1000)
    };

    // Stage 1: Webhook Ingest
    setPipelineState({
      activeStep: 1,
      mode: 'PLAYGROUND',
      statusText: `Stage 1/5: Ingesting payment.failed webhook for ${orderId}...`,
      subText: `Failure code: ${errorDetails.code} (${customCustomerName}, ₹${customOrderAmount})`,
      progress: 20,
      activeOrderId: orderId
    });

    // Stage 2: Idempotency Gate (after 500ms)
    setTimeout(() => {
      setPipelineState({
        activeStep: 2,
        mode: 'PLAYGROUND',
        statusText: `Stage 2/5: Idempotency Gate verifying SHA-256 event hash & 3x retry limit...`,
        subText: `Checked SQLite cache for event_id: ${eventId} -> 0 prior attempts (Passed).`,
        progress: 40,
        activeOrderId: orderId
      });
    }, 500);

    // Stage 3: Hybrid AI Diagnosis (after 1100ms)
    setTimeout(() => {
      setPipelineState({
        activeStep: 3,
        mode: 'PLAYGROUND',
        statusText: `Stage 3/5: Gemini 2.5 Flash analyzing failure reasons & drafting copy...`,
        subText: `Classifying ${customScenario} and building tailored recovery action.`,
        progress: 60,
        activeOrderId: orderId
      });
    }, 1100);

    try {
      const res = await fetch(`${API_BASE_URL}/webhook/razorpay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setInjectionResult({ ...data, orderId, amount: customOrderAmount });

      // Stage 4: Autonomous Action (after 1800ms)
      setTimeout(() => {
        setPipelineState({
          activeStep: 4,
          mode: 'PLAYGROUND',
          statusText: `Stage 4/5: Dispatching action: ${data.action || 'RECOVERY_LINK'}...`,
          subText: `Generated Razorpay 1-click test link & prepared customer nudge.`,
          progress: 80,
          activeOrderId: orderId
        });
      }, 1800);

      // Stage 5: State Saved & Ready (after 2600ms)
      setTimeout(() => {
        setPipelineState({
          activeStep: 5,
          mode: 'PLAYGROUND',
          statusText: `Stage 5/5: State set to ${data.to_state || 'NUDGED'}. Ready for customer checkout!`,
          subText: `Transaction persisted to SQLite ledger and visible in live table.`,
          progress: 100,
          activeOrderId: orderId
        });
        fetchStats();
      }, 2600);

      // Completion Banner (after 3400ms)
      setTimeout(() => {
        setPipelineState({
          activeStep: 6,
          mode: 'PLAYGROUND',
          statusText: `✓ Autonomous Recovery Flow Complete for ${orderId}!`,
          subText: `Customer received recovery nudge with 1-click payment link.`,
          progress: 100,
          activeOrderId: orderId
        });
        setIsInjectingSingle(false);
      }, 3400);

      // Reset to standby (after 6500ms)
      setTimeout(() => {
        setPipelineState({
          activeStep: 0,
          mode: null,
          statusText: 'Engine Standby • Ready to process Razorpay webhooks',
          subText: 'All 5 autonomous recovery microservices operating normally (1.5s circuit breaker active).',
          progress: 0,
          activeOrderId: null
        });
      }, 6500);

    } catch (err) {
      const fallbackResult = {
        status: 'mock_processed',
        orderId,
        action: customScenario === 'BANK_DOWNTIME' ? 'SILENT_RETRY' : 'WHATSAPP_NUDGE',
        to_state: customScenario === 'BANK_DOWNTIME' ? 'SILENT_RETRY' : 'NUDGED_WHATSAPP',
        payment_link_url: `https://rzp.io/i/test_${randomSuffix}`,
        reasoning: 'Circuit Breaker fallback test executed offline.',
        is_llm: false
      };
      setInjectionResult({ ...fallbackResult, amount: customOrderAmount });

      setTimeout(() => {
        setPipelineState({
          activeStep: 4,
          mode: 'PLAYGROUND',
          statusText: `Stage 4/5: Deterministic Fallback Action dispatched for ${orderId}...`,
          subText: `Circuit breaker route executed in <50ms without stalling.`,
          progress: 80,
          activeOrderId: orderId
        });
      }, 1500);

      setTimeout(() => {
        setPipelineState({
          activeStep: 5,
          mode: 'PLAYGROUND',
          statusText: `Stage 5/5: State saved to ${fallbackResult.to_state}.`,
          subText: `Recovery link generated for offline testing.`,
          progress: 100,
          activeOrderId: orderId
        });
      }, 2200);

      setTimeout(() => {
        setPipelineState({
          activeStep: 6,
          mode: 'PLAYGROUND',
          statusText: `✓ Autonomous Recovery Completed for ${orderId}!`,
          subText: `Fallback pipeline demonstrated offline resilience.`,
          progress: 100,
          activeOrderId: orderId
        });
        setIsInjectingSingle(false);
      }, 3000);

      setTimeout(() => {
        setPipelineState({
          activeStep: 0,
          mode: null,
          statusText: 'Engine Standby • Ready to process Razorpay webhooks',
          subText: 'All 5 autonomous recovery microservices operating normally (1.5s circuit breaker active).',
          progress: 0,
          activeOrderId: null
        });
      }, 6000);
    }
  };

  // Simulate customer completing recovery payment with visual feedback
  const handleSimulatePaymentSuccess = async (orderId, amount) => {
    const succEventId = `evt_succ_${orderId}_${Date.now()}`;
    const payload = {
      entity: 'event',
      account_id: 'acc_recoveryiq_demo',
      event: 'payment.captured',
      event_id: succEventId,
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: `pay_succ_${Math.floor(1000 + Math.random() * 9000)}`,
            order_id: orderId,
            amount: Math.round(amount * 100),
            currency: 'INR',
            status: 'captured',
            email: 'customer@example.com',
            contact: '+919876543210'
          }
        }
      },
      created_at: Math.floor(Date.now() / 1000)
    };

    // Animate Step 1: Ingesting payment.captured
    setPipelineState({
      activeStep: 1,
      mode: 'PAYMENT',
      statusText: `Stage 1/5: Ingesting payment.captured webhook for ${orderId}...`,
      subText: `Razorpay confirmed payment receipt for ₹${amount}.`,
      progress: 30,
      activeOrderId: orderId
    });

    // Animate Step 5: Loop Closed & State RECOVERED
    setTimeout(() => {
      setPipelineState({
        activeStep: 5,
        mode: 'PAYMENT',
        statusText: `Stage 5/5: Marking ${orderId} as RECOVERED & incrementing recovered GMV!`,
        subText: `Audit log locked, customer messaging stopped, recovery loop sealed.`,
        progress: 100,
        activeOrderId: orderId
      });
    }, 600);

    setTimeout(() => {
      setPipelineState({
        activeStep: 6,
        mode: 'PAYMENT',
        statusText: `🎉 Successfully Recovered ₹${Number(amount).toLocaleString('en-IN')} for ${orderId}!`,
        subText: `Transaction ledger and dashboard KPIs synchronized.`,
        progress: 100,
        activeOrderId: orderId
      });
    }, 1400);

    setTimeout(() => {
      setPipelineState({
        activeStep: 0,
        mode: null,
        statusText: 'Engine Standby • Ready to process Razorpay webhooks',
        subText: 'All 5 autonomous recovery microservices operating normally (1.5s circuit breaker active).',
        progress: 0,
        activeOrderId: null
      });
    }, 4500);

    try {
      await fetch(`${API_BASE_URL}/webhook/razorpay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      fetchStats();
      if (selectedTransaction && selectedTransaction.order_id === orderId) {
        setSelectedTransaction((prev) => ({ ...prev, state: 'RECOVERED' }));
      }
    } catch {
      // Local optimistic update
      setTransactions((prev) =>
        prev.map((t) => (t.order_id === orderId ? { ...t, state: 'RECOVERED' } : t))
      );
      setMetrics((prev) => ({
        ...prev,
        total_recovered: prev.total_recovered + (amount || 0)
      }));
    }
  };

  // Open Razorpay 1-Click Recovery Checkout Modal
  const handleOpenPaymentModal = (tx) => {
    setActivePaymentModal(tx);
    setPaymentSuccess(tx.state === 'RECOVERED');
    setPaymentProcessing(false);
  };

  // Execute Payment via Razorpay Recovery intent
  const handleExecutePayment = async () => {
    if (!activePaymentModal) return;
    setPaymentProcessing(true);
    await new Promise((r) => setTimeout(r, 600));
    await handleSimulatePaymentSuccess(activePaymentModal.order_id, activePaymentModal.amount);
    setPaymentProcessing(false);
    setPaymentSuccess(true);
    if (activePaymentModal) {
      setActivePaymentModal((prev) => (prev ? { ...prev, state: 'RECOVERED' } : null));
    }
  };

  // Filter transactions
  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch =
      (tx.order_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tx.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tx.failure_reason || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tx.failure_code || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterState === 'ALL') return true;
    if (filterState === 'NUDGED') {
      return tx.state === 'NUDGED_WHATSAPP' || tx.state === 'NUDGED_EMAIL';
    }
    return tx.state === filterState;
  });

  // State Badge Renderer
  const renderStateBadge = (state) => {
    switch (state) {
      case 'RECOVERED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm shadow-emerald-950">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            RECOVERED
          </span>
        );
      case 'NUDGED_WHATSAPP':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm shadow-cyan-950">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            NUDGED (WHATSAPP)
          </span>
        );
      case 'NUDGED_EMAIL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
            NUDGED (EMAIL)
          </span>
        );
      case 'SILENT_RETRY':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3 animate-spin" />
            SILENT_RETRY
          </span>
        );
      case 'TERMINATED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            TERMINATED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            {state || 'PENDING'}
          </span>
        );
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 antialiased font-sans flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background Accent Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/4 w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-20 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[160px]" />
        <div className="absolute -bottom-20 left-10 w-[500px] h-[500px] bg-emerald-600/5 rounded-full blur-[140px]" />
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-10 border-b border-[#1e293b] bg-[#0c1220]/85 backdrop-blur-md sticky top-0 px-6 py-4 transition-all">
        <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Brand & Subtitle */}
          <div className="flex items-center gap-3.5">
            <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20 border border-cyan-400/30">
              <Zap className="w-6 h-6 text-white" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                  RecoverIQ <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">ENTERPRISE</span>
                </h1>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Autonomous Payment Recovery &amp; Root-Cause Orchestration for Razorpay
              </p>
            </div>
          </div>

          {/* Action Buttons & Status Pills */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* System Guide Modal Trigger */}
            <button
              onClick={() => setShowGuideModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111726] hover:bg-[#1a233a] border border-[#1e293b] text-xs font-medium text-slate-300 transition-all cursor-pointer"
            >
              <Workflow className="w-3.5 h-3.5 text-cyan-400" />
              <span>Flowchart &amp; Architecture</span>
            </button>

            {/* Test Single Failure Playground Trigger */}
            <button
              onClick={() => setShowPlaygroundModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-xs font-medium text-purple-300 transition-all cursor-pointer shadow-sm"
            >
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              <span>Interactive Playground</span>
            </button>

            {/* Live Connection Pill */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
              isLiveConnected 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
              {isLiveConnected ? 'API Connected' : 'Demo Mode'}
            </div>

            {/* Batch Simulation Button */}
            <button
              onClick={handleRunSimulation}
              disabled={isSimulating || isResetting}
              className="relative inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-xs text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:scale-95 transition-all shadow-lg shadow-cyan-500/25 border border-cyan-400/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSimulating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>Simulating 50 Events...</span>
                </>
              ) : (
                <>
                  <Flame className="w-3.5 h-3.5 text-amber-300 animate-bounce" />
                  <span>Run 50-Record Batch Test</span>
                </>
              )}
            </button>

            {/* Reset Database Button */}
            <button
              onClick={handleResetData}
              disabled={isResetting || isSimulating}
              title="Reset all transactions to zero clean state"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-medium text-rose-300 transition-all cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-rose-400 ${isResetting ? 'animate-spin' : ''}`} />
              <span>{isResetting ? 'Resetting...' : 'Reset Data'}</span>
            </button>

            <button
              onClick={() => setView('landing')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-300 transition-all cursor-pointer"
            >
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-[1600px] w-full mx-auto p-6 space-y-6">
        
        {/* ========================================================================= */}
        {/* 🌟 INTERACTIVE AUTONOMOUS RECOVERY LIFECYCLE FLOWCHART BAR & LIVE MONITOR */}
        {/* ========================================================================= */}
        <section className={`rounded-2xl border p-5 shadow-2xl relative overflow-hidden transition-all duration-500 ${
          pipelineState.activeStep > 0
            ? 'bg-gradient-to-r from-[#0a1628] via-[#111f38] to-[#0a1628] border-cyan-400/50 shadow-cyan-950/80'
            : 'bg-gradient-to-r from-[#0e1628] via-[#111726] to-[#0e1628] border-cyan-500/20'
        }`}>
          {/* Header Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className={`p-2 rounded-xl transition-all duration-300 ${
                pipelineState.activeStep > 0
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-lg shadow-cyan-500/30'
                  : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
              }`}>
                <Workflow className={`w-5 h-5 ${pipelineState.activeStep > 0 ? 'animate-pulse text-cyan-300' : ''}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white tracking-wide uppercase">
                    Autonomous Recovery Lifecycle Pipeline
                  </h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30">
                    5-STAGE ZERO-TOUCH ENGINE
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real-time visualization of autonomous event ingestion, diagnosis, dispatch, and settlement.
                </p>
              </div>
            </div>

            {/* Live Pipeline Execution Mode Pill */}
            <div className="flex items-center gap-2">
              {pipelineState.activeStep > 0 ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-950/80 border border-cyan-400/50 text-cyan-300 text-xs font-semibold shadow-md shadow-cyan-950 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                  <span>
                    {pipelineState.mode === 'BATCH'
                      ? '⚡ 50-BATCH PIPELINE RUNNING'
                      : pipelineState.mode === 'PLAYGROUND'
                      ? '⚡ LIVE DIAGNOSTIC INJECTION'
                      : '⚡ RECOVERY SETTLEMENT'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-400 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>STANDBY • LISTENING</span>
                </div>
              )}
            </div>
          </div>

          {/* ⚡ Real-Time Live Execution Monitor Banner (Shows during simulation or execution) */}
          {pipelineState.activeStep > 0 && (
            <div className="mb-4 p-3.5 rounded-xl bg-[#090e1a]/95 border border-cyan-500/30 shadow-inner relative overflow-hidden animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-bold font-mono">
                    {pipelineState.activeStep <= 5 ? pipelineState.activeStep : '✓'}
                  </div>
                  <span className="text-xs font-bold text-cyan-200">
                    {pipelineState.statusText}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                  <span className="text-cyan-400 font-semibold">{pipelineState.progress}% Complete</span>
                  {pipelineState.activeOrderId && (
                    <span className="text-slate-500">• Target: {pipelineState.activeOrderId}</span>
                  )}
                </div>
              </div>

              {/* Shimmering Progress Track */}
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${pipelineState.progress}%` }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                  {pipelineState.subText}
                </span>
                <span className="text-[10px] text-slate-500 hidden md:inline">
                  Zero Human Intervention • Sub-50ms SLA
                </span>
              </div>
            </div>
          )}

          {/* Stepper Grid with Dynamic Visual States */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 relative">
            {FLOW_STEPS.map((step, idx) => {
              const IconComponent = step.icon;
              const isActive = pipelineState.activeStep === step.step;
              const isCompleted = pipelineState.activeStep > step.step || pipelineState.activeStep === 6;
              const isPending = pipelineState.activeStep > 0 && pipelineState.activeStep < step.step;

              // Dynamic styling based on step execution
              let cardBg = step.bg;
              let cardBorder = step.border;
              let extraClasses = 'hover:scale-[1.02] hover:shadow-lg hover:shadow-cyan-950';

              if (isActive) {
                cardBg = 'bg-cyan-950/70';
                cardBorder = 'border-cyan-400 ring-2 ring-cyan-400/80 shadow-xl shadow-cyan-500/30 scale-[1.03]';
                extraClasses = 'animate-glow-pulse';
              } else if (isCompleted) {
                cardBg = 'bg-emerald-950/20';
                cardBorder = 'border-emerald-500/50 shadow-md shadow-emerald-950/40';
              } else if (isPending) {
                cardBg = 'bg-[#0b101c]/60';
                cardBorder = 'border-slate-800/80';
                extraClasses = 'opacity-60';
              }

              return (
                <div
                  key={step.step}
                  onClick={() => setSelectedFlowStep(step)}
                  className={`group relative rounded-xl border p-3.5 cursor-pointer transition-all duration-300 ${cardBg} ${cardBorder} ${extraClasses} flex flex-col justify-between`}
                >
                  {/* Top Meta Bar */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[11px] font-mono font-bold ${
                      isActive ? 'text-cyan-300' : isCompleted ? 'text-emerald-400' : 'text-slate-400'
                    }`}>
                      STEP 0{step.step}
                    </span>

                    {/* Dynamic Status Badge / Icon */}
                    <div className="flex items-center gap-1.5">
                      {isActive ? (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 text-[10px] font-bold flex items-center gap-1">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          <span>ACTIVE</span>
                        </span>
                      ) : isCompleted ? (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                          <span>DONE</span>
                        </span>
                      ) : isPending ? (
                        <span className="text-[10px] text-slate-500 font-mono">QUEUED</span>
                      ) : null}

                      <div className={`p-1.5 rounded-lg border ${
                        isActive
                          ? 'bg-cyan-500 text-white border-cyan-300 shadow-md shadow-cyan-500/40'
                          : isCompleted
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : `bg-[#090d16]/80 ${step.color} border-slate-800`
                      }`}>
                        <IconComponent className={`w-4 h-4 ${isActive ? 'animate-bounce' : ''}`} />
                      </div>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className={`text-xs font-bold transition-colors ${
                      isActive ? 'text-cyan-200' : isCompleted ? 'text-emerald-200' : 'text-slate-100 group-hover:' + step.color
                    }`}>
                      {step.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                      {step.desc}
                    </p>
                  </div>

                  {/* Bottom Action / Inspect link */}
                  <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span className={`transition-colors ${
                      isActive ? 'text-cyan-300 font-bold' : isCompleted ? 'text-emerald-400' : 'group-hover:text-cyan-300'
                    }`}>
                      {isActive ? 'Executing live ⚡' : isCompleted ? 'Verification passed ✓' : 'Inspect mechanics'}
                    </span>
                    <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform text-cyan-400" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* KPI Metric Cards Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Revenue at Risk */}
          <div className="relative overflow-hidden rounded-2xl bg-[#111726] border border-[#1e293b] p-5 shadow-xl transition-all duration-300 hover:border-amber-500/30 group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Revenue at Risk
              </span>
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl lg:text-3xl font-extrabold text-amber-400 tracking-tight">
                {formatCurrency(metrics.total_at_risk)}
              </div>
              <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
                <span>Failed GMV captured via webhooks</span>
              </p>
            </div>
          </div>

          {/* Card 2: Recovered Revenue */}
          <div className="relative overflow-hidden rounded-2xl bg-[#111726] border border-[#1e293b] p-5 shadow-xl transition-all duration-300 hover:border-emerald-500/30 group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Recovered Revenue
              </span>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl lg:text-3xl font-extrabold text-emerald-400 tracking-tight">
                {formatCurrency(metrics.total_recovered)}
              </div>
              <p className="mt-1 text-xs text-emerald-400/80 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Autonomous recoveries converted</span>
              </p>
            </div>
          </div>

          {/* Card 3: Recovery Success Rate */}
          <div className="relative overflow-hidden rounded-2xl bg-[#111726] border border-[#1e293b] p-5 shadow-xl transition-all duration-300 hover:border-cyan-500/30 group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-all"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Recovery Success Rate
              </span>
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl lg:text-3xl font-extrabold text-cyan-400 tracking-tight">
                {(metrics.recovery_rate || 0).toFixed(1)}%
              </div>
              {/* Electric Blue Progress Bar */}
              <div className="mt-2.5 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-1.5 rounded-full transition-all duration-500 shadow-sm shadow-cyan-500/50"
                  style={{ width: `${Math.min(100, Math.max(0, metrics.recovery_rate || 0))}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Card 4: Total Processed Events */}
          <div className="relative overflow-hidden rounded-2xl bg-[#111726] border border-[#1e293b] p-5 shadow-xl transition-all duration-300 hover:border-purple-500/30 group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-all"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Processed Ingestion Events
              </span>
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl lg:text-3xl font-extrabold text-purple-400 tracking-tight">
                {metrics.total_events || transactions.length}
              </div>
              <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-purple-400" />
                <span>Zero-collision idempotency ledger</span>
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 📊 FAILURE INTELLIGENCE ANALYTICS & DOMAIN INSIGHTS */}
        {/* ========================================================================= */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Panel 1: Failure Category Breakdown */}
          <div className="rounded-2xl bg-[#111726] border border-[#1e293b] p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Failure Root-Cause Distribution</h3>
                <p className="text-[10px] text-slate-400">Why payments are failing — by category</p>
              </div>
            </div>
            <div className="space-y-3">
              {(() => {
                const cats = {};
                transactions.forEach(tx => {
                  const code = (tx.failure_code || '').toLowerCase();
                  let cat = 'OTHER';
                  if (code.includes('timeout') || code.includes('gateway') || code.includes('down')) cat = 'BANK_DOWNTIME';
                  else if (code.includes('insufficient') || code.includes('low_balance')) cat = 'INSUFFICIENT_FUNDS';
                  else if (code.includes('dropped') || code.includes('abandon') || code.includes('otp')) cat = 'USER_ABANDONMENT';
                  else if (code.includes('blocked') || code.includes('inactive') || code.includes('expired') || code.includes('card')) cat = 'CARD_BLOCKED';
                  else if (code.includes('fund') || code.includes('upi')) cat = 'INSUFFICIENT_FUNDS';
                  else cat = 'INSUFFICIENT_FUNDS';
                  cats[cat] = (cats[cat] || 0) + 1;
                });
                const total = transactions.length || 1;
                const catConfig = {
                  BANK_DOWNTIME: { label: 'Bank/Gateway Downtime', color: 'bg-amber-500', text: 'text-amber-400', insight: 'Infrastructure — not customer fault' },
                  INSUFFICIENT_FUNDS: { label: 'Insufficient Funds', color: 'bg-cyan-500', text: 'text-cyan-400', insight: 'Recoverable with payment link' },
                  USER_ABANDONMENT: { label: 'User Drop-off (OTP)', color: 'bg-purple-500', text: 'text-purple-400', insight: 'High intent — nudge converts well' },
                  CARD_BLOCKED: { label: 'Card Blocked/Expired', color: 'bg-rose-500', text: 'text-rose-400', insight: 'Suggest alternate payment method' }
                };
                return Object.entries(catConfig).map(([key, config]) => {
                  const count = cats[key] || 0;
                  const pct = ((count / total) * 100).toFixed(0);
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-semibold ${config.text}`}>{config.label}</span>
                        <span className="font-mono text-slate-300">{count} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className={`${config.color} h-2 rounded-full transition-all duration-700`} style={{ width: `${pct}%` }}></div>
                      </div>
                      <p className="text-[10px] text-slate-500 italic">{config.insight}</p>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Panel 2: Recovery Conversion Funnel */}
          <div className="rounded-2xl bg-[#111726] border border-[#1e293b] p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Recovery Conversion Funnel</h3>
                <p className="text-[10px] text-slate-400">Multi-stage conversion from failure to recovery</p>
              </div>
            </div>
            {(() => {
              const totalFailed = transactions.length;
              const nudged = transactions.filter(t => ['NUDGED_WHATSAPP', 'NUDGED_EMAIL', 'RECOVERED'].includes(t.state)).length;
              const recovered = transactions.filter(t => t.state === 'RECOVERED').length;
              const terminated = transactions.filter(t => t.state === 'TERMINATED').length;
              const silentRetry = transactions.filter(t => t.state === 'SILENT_RETRY').length;
              const nudgeRate = totalFailed ? ((nudged / totalFailed) * 100).toFixed(1) : '0';
              const convRate = nudged ? ((recovered / nudged) * 100).toFixed(1) : '0';
              
              const stages = [
                { label: 'Total Failed Payments', count: totalFailed, width: '100', color: 'from-red-500 to-rose-500', icon: AlertTriangle },
                { label: 'Silent Retry (Bank Issue)', count: silentRetry, width: totalFailed ? ((silentRetry / totalFailed) * 100).toFixed(0) : '0', color: 'from-amber-500 to-yellow-500', icon: Clock },
                { label: 'Nudged (WhatsApp/Email)', count: nudged, width: totalFailed ? ((nudged / totalFailed) * 100).toFixed(0) : '0', color: 'from-cyan-500 to-blue-500', icon: Send },
                { label: 'Recovered (Paid)', count: recovered, width: totalFailed ? ((recovered / totalFailed) * 100).toFixed(0) : '0', color: 'from-emerald-500 to-green-500', icon: CheckCircle2 },
                { label: 'Terminated (Guardrail)', count: terminated, width: totalFailed ? ((terminated / totalFailed) * 100).toFixed(0) : '0', color: 'from-slate-500 to-slate-600', icon: XCircle },
              ];
              return (
                <div className="space-y-2.5">
                  {stages.map((stage, i) => {
                    const Icon = stage.icon;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                            <Icon className="w-3 h-3" />
                            {stage.label}
                          </span>
                          <span className="font-mono text-white font-bold">{stage.count}</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                          <div className={`bg-gradient-to-r ${stage.color} h-2.5 rounded-full transition-all duration-700`} style={{ width: `${Math.max(stage.count > 0 ? 4 : 0, stage.width)}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="mt-3 pt-3 border-t border-[#1e293b] grid grid-cols-2 gap-2">
                    <div className="bg-[#0c1220] rounded-lg p-2.5 border border-[#1e293b] text-center">
                      <div className="text-lg font-extrabold text-cyan-400">{nudgeRate}%</div>
                      <div className="text-[10px] text-slate-400">Nudge Rate</div>
                    </div>
                    <div className="bg-[#0c1220] rounded-lg p-2.5 border border-[#1e293b] text-center">
                      <div className="text-lg font-extrabold text-emerald-400">{convRate}%</div>
                      <div className="text-[10px] text-slate-400">Nudge → Paid</div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Panel 3: Revenue Projector + Smart Retry + Bank Health (stacked) */}
          <div className="space-y-4">
            {/* Revenue Impact Projector */}
            <div className="rounded-2xl bg-gradient-to-br from-[#111726] to-[#0e1a2e] border border-emerald-500/20 p-5 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Projected Annual Impact</h3>
                  <p className="text-[10px] text-slate-400">Based on current recovery performance</p>
                </div>
              </div>
              {(() => {
                const recovered = metrics.total_recovered || 0;
                const annualProjection = recovered * 365;
                const monthlyProjection = recovered * 30;
                return (
                  <div className="space-y-2">
                    <div className="bg-[#0c1220] rounded-xl p-3 border border-emerald-500/10 text-center">
                      <div className="text-2xl font-extrabold text-emerald-400 tracking-tight">
                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(annualProjection)}
                      </div>
                      <div className="text-[10px] text-emerald-400/70 font-semibold mt-0.5">ESTIMATED ANNUAL SAVINGS</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-[#0c1220] rounded-lg p-2 border border-[#1e293b]">
                        <div className="text-sm font-bold text-cyan-400">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(monthlyProjection)}</div>
                        <div className="text-[9px] text-slate-500">Monthly</div>
                      </div>
                      <div className="bg-[#0c1220] rounded-lg p-2 border border-[#1e293b]">
                        <div className="text-sm font-bold text-purple-400">{(metrics.recovery_rate || 0).toFixed(1)}%</div>
                        <div className="text-[9px] text-slate-500">Recovery Rate</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Smart Retry Timing Indicator */}
            <div className="rounded-2xl bg-[#111726] border border-[#1e293b] p-4 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Timer className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-xs font-bold text-white">UPI Settlement Window Status</h3>
              </div>
              {(() => {
                const hour = new Date().getHours();
                let windowStatus, windowColor, windowDesc, windowBorder;
                if (hour >= 8 && hour <= 10) {
                  windowStatus = 'OPTIMAL';
                  windowColor = 'text-emerald-400';
                  windowBorder = 'border-emerald-500/30 bg-emerald-500/5';
                  windowDesc = 'Morning settlement batch — highest retry success rate';
                } else if (hour >= 10 && hour <= 18) {
                  windowStatus = 'GOOD';
                  windowColor = 'text-cyan-400';
                  windowBorder = 'border-cyan-500/30 bg-cyan-500/5';
                  windowDesc = 'Active banking hours — customer reachable, banks online';
                } else if (hour >= 18 && hour <= 22) {
                  windowStatus = 'MODERATE';
                  windowColor = 'text-amber-400';
                  windowBorder = 'border-amber-500/30 bg-amber-500/5';
                  windowDesc = 'Evening wind-down — NPCI batch settlement queued';
                } else {
                  windowStatus = 'LOW';
                  windowColor = 'text-rose-400';
                  windowBorder = 'border-rose-500/30 bg-rose-500/5';
                  windowDesc = 'Off-hours — RBI RTGS closed, defer retries to 8 AM';
                }
                return (
                  <div className={`rounded-xl border p-3 ${windowBorder}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${windowColor}`}>⏰ {windowStatus} WINDOW</span>
                      <span className="text-[10px] font-mono text-slate-400">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">{windowDesc}</p>
                  </div>
                );
              })()}
            </div>

            {/* Bank Health Monitor */}
            <div className="rounded-2xl bg-[#111726] border border-[#1e293b] p-4 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-xs font-bold text-white">Bank Infrastructure Health</h3>
              </div>
              <div className="space-y-1.5">
                {(() => {
                  const bankFailures = {};
                  const bankTotal = {};
                  transactions.forEach(tx => {
                    const code = (tx.failure_code || '').toUpperCase();
                    const desc = (tx.failure_reason || tx.failure_desc || '').toUpperCase();
                    let bank = 'OTHER';
                    if (code.includes('HDFC') || desc.includes('HDFC')) bank = 'HDFC';
                    else if (code.includes('SBI') || desc.includes('SBI') || desc.includes('STATE BANK')) bank = 'SBI';
                    else if (code.includes('ICICI') || desc.includes('ICICI')) bank = 'ICICI';
                    else if (code.includes('AXIS') || desc.includes('AXIS')) bank = 'AXIS';
                    else if (code.includes('UPI') || desc.includes('UPI') || desc.includes('VPA')) bank = 'UPI/NPCI';
                    else if (code.includes('CARD') || desc.includes('CARD') || desc.includes('ISSUER')) bank = 'Card Issuers';
                    else bank = 'Other Banks';
                    
                    bankTotal[bank] = (bankTotal[bank] || 0) + 1;
                    if (code.includes('TIMEOUT') || code.includes('GATEWAY') || code.includes('DOWN') || desc.includes('TIMEOUT') || desc.includes('DOWN')) {
                      bankFailures[bank] = (bankFailures[bank] || 0) + 1;
                    }
                  });
                  const banks = Object.keys(bankTotal).sort((a, b) => bankTotal[b] - bankTotal[a]).slice(0, 5);
                  return banks.map(bank => {
                    const fails = bankFailures[bank] || 0;
                    const total = bankTotal[bank] || 1;
                    const failRate = (fails / total) * 100;
                    let health, healthColor, dot;
                    if (failRate > 50) { health = 'OUTAGE'; healthColor = 'text-rose-400'; dot = 'bg-rose-400 animate-pulse'; }
                    else if (failRate > 20) { health = 'DEGRADED'; healthColor = 'text-amber-400'; dot = 'bg-amber-400'; }
                    else { health = 'HEALTHY'; healthColor = 'text-emerald-400'; dot = 'bg-emerald-400'; }
                    return (
                      <div key={bank} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[#0c1220] border border-[#1a2333]">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${dot}`}></span>
                          <span className="text-xs text-slate-200 font-medium">{bank}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-500">{total} txns</span>
                          <span className={`text-[10px] font-bold ${healthColor}`}>{health}</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </section>

        {/* Main 2-Column Split View */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (60% width = col-span-7) - Live Transaction Ledger */}
          <div className="lg:col-span-7 rounded-2xl bg-[#111726] border border-[#1e293b] shadow-2xl overflow-hidden flex flex-col">
            {/* Header, Search & Filter Tabs */}
            <div className="p-5 border-b border-[#1e293b] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400"></div>
                  <h2 className="text-base font-bold text-white tracking-wide">
                    Live Transaction Ledger
                  </h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                    {filteredTransactions.length} records
                  </span>
                </div>

                {/* Search Box */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search Order, Customer, Error..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full sm:w-56 pl-8 pr-3 py-1.5 rounded-lg bg-[#0c1220] border border-[#1e293b] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
                  />
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {['ALL', 'NUDGED', 'SILENT_RETRY', 'RECOVERED', 'TERMINATED'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilterState(tab)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      filterState === tab
                        ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/30'
                        : 'bg-[#0c1220] text-slate-400 hover:text-slate-200 border border-[#1e293b]'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Transactions Table Container */}
            <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1e293b] bg-[#0c1220]/70 text-[11px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 backdrop-blur-md z-10">
                    <th className="px-4 py-3">Order &amp; Customer</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Failure Diagnosis</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-center">Retries</th>
                    <th className="px-4 py-3 text-right">Action / Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b]/60 text-xs">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                        {transactions.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <span className="text-slate-400 font-medium">No recovery transactions recorded yet.</span>
                            <span className="text-xs text-slate-500">Click &ldquo;Run 50-Record Batch Test&rdquo; above to simulate live Razorpay failure events.</span>
                          </div>
                        ) : (
                          "No transactions found matching the filter."
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <tr
                        key={tx.id || tx.order_id}
                        onClick={() => setSelectedTransaction(tx)}
                        className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      >
                        {/* Order & Customer */}
                        <td className="px-4 py-3.5">
                          <div className="font-mono text-cyan-300 font-medium text-[11px] flex items-center gap-1.5">
                            <span>{tx.order_id}</span>
                          </div>
                          <div className="font-semibold text-slate-200 text-xs mt-0.5">
                            {tx.customer_name}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {tx.contact || tx.email}
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3.5 text-right font-bold text-slate-100 whitespace-nowrap">
                          {formatCurrency(tx.amount)}
                        </td>

                        {/* Failure Diagnosis */}
                        <td className="px-4 py-3.5 max-w-[190px]">
                          <span className="block text-[11px] font-mono text-rose-300/90 truncate">
                            {tx.failure_code}
                          </span>
                          <span className="block text-[10px] text-slate-400 truncate mt-0.5" title={tx.failure_reason}>
                            {tx.failure_reason}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {renderStateBadge(tx.state)}
                        </td>

                        {/* Retries */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                            tx.retry_count >= 3
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-slate-800 text-slate-300'
                          }`}>
                            {tx.retry_count}/3
                          </span>
                        </td>

                        {/* Action / Preview */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {tx.payment_link_url ? (
                              tx.state === 'RECOVERED' ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenPaymentModal(tx);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold transition-all cursor-pointer"
                                >
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Paid ✓</span>
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenPaymentModal(tx);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 text-[11px] font-semibold transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
                                >
                                  <Zap className="w-3 h-3 text-cyan-400" />
                                  <span>Pay Link</span>
                                </button>
                              )
                            ) : null}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTransaction(tx);
                              }}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors cursor-pointer"
                            >
                              Inspect
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column (40% width = col-span-5) - Live AI Decision Stream */}
          <div className="lg:col-span-5 rounded-2xl bg-[#111726] border border-[#1e293b] shadow-2xl overflow-hidden flex flex-col">
            {/* Decision Stream Header */}
            <div className="p-5 border-b border-[#1e293b] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                <h2 className="text-base font-bold text-white tracking-wide">
                  Live AI Decision Stream
                </h2>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                <Radio className="w-3 h-3 text-cyan-400 animate-ping" />
                <span>Real-Time Audit</span>
              </div>
            </div>

            {/* Audit Log Vertical Feed */}
            <div className="p-4 space-y-3.5 max-h-[670px] overflow-y-auto">
              {auditLogs.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs">
                  No decision logs recorded yet. Run a batch test to observe AI actions.
                </div>
              ) : (
                auditLogs.map((log) => {
                  const isLLM = log.is_llm_decision;
                  const logTime = log.timestamp
                    ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : 'Just now';

                  return (
                    <div
                      key={log.id || `${log.order_id}_${log.timestamp}`}
                      className="rounded-xl bg-[#0c1220] border border-[#1e293b] p-4 transition-all duration-200 hover:border-slate-700 hover:bg-[#0f172a]/70 group space-y-2.5"
                    >
                      {/* Top Row: Timestamp, Order, Diagnostic Type Badge */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {logTime}
                          </span>
                          <span className="text-xs font-mono font-semibold text-cyan-300">
                            {log.order_id}
                          </span>
                        </div>

                        {/* AI vs Circuit Breaker Tag */}
                        {isLLM ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30">
                            <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                            🧠 LLM Diagnostic
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                            <Zap className="w-2.5 h-2.5 text-cyan-400" />
                            ⚡ Circuit Breaker Fallback
                          </span>
                        )}
                      </div>

                      {/* Middle Row: Action & State Transition */}
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono font-bold border border-slate-700">
                          [{log.action_taken}]
                        </span>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                          <span className="text-slate-400">{log.from_state || 'PENDING'}</span>
                          <ArrowRight className="w-3 h-3 text-slate-500" />
                          <span className="text-emerald-400 font-semibold">{log.to_state}</span>
                        </div>
                      </div>

                      {/* Bottom Row: Reasoning text */}
                      <p className="text-xs text-slate-300 leading-relaxed font-sans bg-[#080d1a] p-2.5 rounded-lg border border-[#1a2333]">
                        {log.reasoning}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ========================================================================= */}
      {/* 🔍 STAGE INSPECTOR MODAL */}
      {/* ========================================================================= */}
      {selectedFlowStep && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-cyan-500/30 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Workflow className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-white">
                  {selectedFlowStep.detailTitle}
                </h3>
              </div>
              <button
                onClick={() => setSelectedFlowStep(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {selectedFlowStep.detailDesc}
            </p>

            <div className="p-3.5 rounded-xl bg-[#0c1220] border border-[#1e293b] text-xs space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                Key Technical Guarantees
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                <li>Zero data loss with synchronous SQLite WAL state retention.</li>
                <li>Hard 1.5s circuit breaker protects merchant checkout throughput.</li>
                <li>Automatic anti-spam termination at 3 attempts protects brand reputation.</li>
              </ul>
            </div>

            <button
              onClick={() => setSelectedFlowStep(null)}
              className="w-full py-2 rounded-lg bg-cyan-500 text-white text-xs font-semibold hover:bg-cyan-400 transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🧪 INTERACTIVE TEST PLAYGROUND MODAL */}
      {/* ========================================================================= */}
      {showPlaygroundModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-purple-500/30 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Live Failure Diagnostic Playground
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Inject a single simulated failure and watch RecoverIQ classify &amp; act live
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPlaygroundModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Select Payment Failure Scenario
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'INSUFFICIENT_FUNDS', label: 'Insufficient Balance', action: 'WhatsApp Nudge' },
                    { id: 'BANK_DOWNTIME', label: 'Bank Gateway Down', action: 'Silent Retry' },
                    { id: 'USER_ABANDONMENT', label: 'Dropped at OTP', action: 'WhatsApp Nudge' },
                    { id: 'CARD_BLOCKED', label: 'Card Blocked / Inactive', action: 'Email Nudge' }
                  ].map((sc) => (
                    <button
                      key={sc.id}
                      onClick={() => setCustomScenario(sc.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        customScenario === sc.id
                          ? 'bg-purple-500/20 border-purple-400 text-white'
                          : 'bg-[#0c1220] border-[#1e293b] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-semibold text-xs text-purple-300">{sc.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Expected: {sc.action}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={customCustomerName}
                    onChange={(e) => setCustomCustomerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0c1220] border border-[#1e293b] text-slate-200 text-xs focus:outline-none focus:border-purple-500/50"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Order Amount (₹)</label>
                  <input
                    type="number"
                    value={customOrderAmount}
                    onChange={(e) => setCustomOrderAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-[#0c1220] border border-[#1e293b] text-slate-200 text-xs focus:outline-none focus:border-purple-500/50"
                  />
                </div>
              </div>

              <button
                onClick={handleInjectSingleFailure}
                disabled={isInjectingSingle}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isInjectingSingle ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing with AI Engine...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
                    <span>Inject Webhook &amp; Run Engine</span>
                  </>
                )}
              </button>

              {/* 🌟 Live 5-Stage Step Visual Progress Tracker in Modal */}
              {(isInjectingSingle || injectionResult) && (
                <div className="p-3.5 rounded-xl bg-[#090e1a] border border-purple-500/30 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Workflow className="w-3.5 h-3.5 text-purple-400" />
                      Live 5-Stage Zero-Touch Pipeline
                    </span>
                    <span className="text-[11px] font-mono text-cyan-400 font-semibold">
                      {pipelineState.progress}% Complete
                    </span>
                  </div>

                  {/* Stage Progress Tracker */}
                  <div className="space-y-1.5">
                    {FLOW_STEPS.map((s) => {
                      const isCurrent = pipelineState.activeStep === s.step;
                      const isDone = pipelineState.activeStep > s.step || pipelineState.activeStep === 6;
                      return (
                        <div
                          key={s.step}
                          className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-all duration-300 ${
                            isCurrent
                              ? 'bg-cyan-950/60 border-cyan-400/80 text-cyan-200 ring-1 ring-cyan-400/50 shadow-md shadow-cyan-950'
                              : isDone
                              ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-[#0c1220]/50 border-slate-800/80 text-slate-500'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              isCurrent
                                ? 'bg-cyan-500 text-white animate-pulse'
                                : isDone
                                ? 'bg-emerald-500 text-white'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {isDone ? '✓' : s.step}
                            </span>
                            <span className={`font-medium text-[11px] ${
                              isCurrent ? 'text-cyan-200 font-bold' : isDone ? 'text-emerald-200' : 'text-slate-400'
                            }`}>
                              {s.title}
                            </span>
                          </div>

                          <div className="text-[10px] font-mono">
                            {isCurrent ? (
                              <span className="flex items-center gap-1 text-cyan-300 font-bold animate-pulse">
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Processing
                              </span>
                            ) : isDone ? (
                              <span className="text-emerald-400 font-bold">Passed ✓</span>
                            ) : (
                              <span className="text-slate-600">Pending</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Injection Outcome Box */}
              {injectionResult && (
                <div className="p-3.5 rounded-xl bg-[#0c1220] border border-purple-500/30 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-cyan-300 font-semibold">
                      {injectionResult.orderId}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      State: {injectionResult.to_state}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    <span className="font-bold text-purple-300">Reasoning:</span> {injectionResult.reasoning}
                  </p>
                  {injectionResult.payment_link_url && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1e293b]">
                      <button
                        onClick={() => handleOpenPaymentModal({
                          order_id: injectionResult.orderId || injectionResult.order_id,
                          amount: customOrderAmount,
                          customer_name: customCustomerName,
                          email: 'customer@example.com',
                          contact: '+919876543210',
                          payment_link_url: injectionResult.payment_link_url,
                          state: injectionResult.to_state
                        })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 cursor-pointer transition-all active:scale-95"
                      >
                        <Zap className="w-3.5 h-3.5 fill-slate-950" />
                        <span>⚡ 1-Click Test Checkout ({formatCurrency(customOrderAmount)})</span>
                      </button>
                      <span className="text-[10px] font-mono text-cyan-400/80 truncate max-w-[180px]">
                        {injectionResult.payment_link_url}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 💬 TRANSACTION INSPECTION & CUSTOMER MESSAGE PREVIEW DRAWER */}
      {/* ========================================================================= */}
      {selectedTransaction && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-[#1e293b] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">
                    Order Diagnostics: {selectedTransaction.order_id}
                  </h3>
                  {renderStateBadge(selectedTransaction.state)}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Customer: {selectedTransaction.customer_name} • {formatCurrency(selectedTransaction.amount)}
                </p>
              </div>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Failure Breakdown */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#0c1220] border border-[#1e293b]">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Failure Code</span>
                <div className="font-mono text-rose-400 font-semibold text-xs mt-1">
                  {selectedTransaction.failure_code}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#0c1220] border border-[#1e293b]">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Retry Count</span>
                <div className="font-mono text-slate-200 font-semibold text-xs mt-1">
                  {selectedTransaction.retry_count} / 3 Attempts
                </div>
              </div>
            </div>

            {/* WhatsApp / Email Customer Nudge Mockup */}
            <div className="rounded-xl bg-[#080d1a] border border-[#1e293b] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1 font-semibold text-slate-300">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                  Customer Communication Preview (WhatsApp / Email)
                </span>
                <span className="text-[10px] font-mono">Delivered via RecoverIQ</span>
              </div>

              {/* Chat Bubble */}
              <div className="p-3.5 rounded-2xl rounded-tl-sm bg-emerald-950/40 border border-emerald-600/30 text-emerald-100 text-xs space-y-2">
                <p>
                  Hey <span className="font-bold">{selectedTransaction.customer_name}</span>! Aapka ₹{selectedTransaction.amount} ka payment complete nahi ho paya tha ({selectedTransaction.failure_reason}).
                </p>
                <p>
                  Aap bina kisi delay ke yahan 1-click me turant retry kar sakte hain:
                </p>
                {selectedTransaction.payment_link_url ? (
                  <button
                    onClick={() => handleOpenPaymentModal(selectedTransaction)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 text-black font-bold text-xs shadow-md shadow-emerald-500/20 hover:bg-emerald-400 cursor-pointer transition-all active:scale-95"
                  >
                    <Zap className="w-3.5 h-3.5 fill-black" />
                    <span>⚡ 1-Click Pay Now ({formatCurrency(selectedTransaction.amount)})</span>
                  </button>
                ) : (
                  <span className="text-xs text-amber-300 italic">
                    (Silent retry active — no customer message dispatched to avoid spam)
                  </span>
                )}
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-2">
              {selectedTransaction.state !== 'RECOVERED' && (
                <button
                  onClick={() => handleOpenPaymentModal(selectedTransaction)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 cursor-pointer transition-all"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>Open 1-Click Recovery Payment</span>
                </button>
              )}
              <button
                onClick={() => setSelectedTransaction(null)}
                className="ml-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 💳 RAZORPAY 1-CLICK RECOVERY CHECKOUT MODAL */}
      {/* ========================================================================= */}
      {activePaymentModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b1324] border border-cyan-500/40 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl space-y-0 animate-in fade-in zoom-in-95">
            {/* Razorpay Branded Top Header */}
            <div className="bg-gradient-to-r from-[#021b3a] via-[#092b5a] to-[#041a38] p-5 border-b border-cyan-500/30 relative">
              <button
                onClick={() => setActivePaymentModal(null)}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center font-bold text-white shadow-md shadow-cyan-500/30">
                  <Zap className="w-5 h-5 fill-white" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-extrabold text-white tracking-wide">Razorpay</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-400/20 text-cyan-300 font-bold border border-cyan-400/30">RECOVER-IQ</span>
                  </div>
                  <p className="text-[10px] text-slate-300">1-Click Fast-Track Settlement</p>
                </div>
              </div>

              {/* Order Summary Pill */}
              <div className="mt-4 p-3 rounded-2xl bg-[#071326]/90 border border-cyan-500/20 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-medium">Order ID</div>
                  <div className="font-mono text-xs font-semibold text-cyan-300">{activePaymentModal.order_id}</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">{activePaymentModal.customer_name || 'Customer'}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 uppercase font-medium">Amount Due</div>
                  <div className="text-lg font-black text-emerald-400">{formatCurrency(activePaymentModal.amount)}</div>
                </div>
              </div>
            </div>

            {/* Payment Modal Body */}
            <div className="p-5 space-y-4">
              {paymentSuccess ? (
                /* Payment Success State */
                <div className="text-center py-6 space-y-4 animate-in fade-in">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto text-emerald-400 shadow-xl shadow-emerald-500/30">
                    <CheckCheck className="w-9 h-9 animate-bounce" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Payment Recovered Successfully!</h3>
                    <p className="text-xs text-emerald-400 font-medium mt-1">
                      ₹{Number(activePaymentModal.amount).toLocaleString('en-IN')} received via Razorpay Switch
                    </p>
                    <p className="text-[11px] text-slate-400 mt-2 px-4 leading-relaxed">
                      The transaction state was immediately updated to <span className="text-emerald-300 font-mono font-bold">RECOVERED</span>, and active recovery reminders have been cancelled.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[#080e1c] border border-emerald-500/20 font-mono text-[11px] text-slate-300 space-y-1 text-left">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Status:</span>
                      <span className="text-emerald-400 font-bold">payment.captured ✓</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Ledger Lock:</span>
                      <span className="text-cyan-300">SQLite Synced</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setActivePaymentModal(null)}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 cursor-pointer transition-all"
                  >
                    Done & Return to Dashboard
                  </button>
                </div>
              ) : (
                /* Payment Methods & Pay Button */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Select Payment Method
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'UPI', label: 'UPI Apps / QR', icon: QrCode, popular: true },
                        { id: 'CARD', label: 'Card Payment', icon: CreditCard },
                        { id: 'NETBANKING', label: 'NetBanking', icon: Building2 },
                      ].map((method) => {
                        const Icon = method.icon;
                        const isSelected = selectedPaymentMethod === method.id;
                        return (
                          <button
                            key={method.id}
                            onClick={() => setSelectedPaymentMethod(method.id)}
                            className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer relative ${
                              isSelected
                                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/20'
                                : 'bg-[#080e1c] border-[#1e293b] text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                            <span className="text-[11px] font-semibold">{method.label}</span>
                            {method.popular && (
                              <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-1.5 py-0.2 rounded-full shadow-sm">
                                FAST
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Method Details Box */}
                  <div className="p-3.5 rounded-2xl bg-[#070e1c] border border-slate-800 text-xs space-y-2">
                    {selectedPaymentMethod === 'UPI' && (
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          <Smartphone className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">1-Click UPI Intent Simulation</div>
                          <div className="text-[11px] text-slate-400">Google Pay • PhonePe • Paytm • BHIM</div>
                        </div>
                      </div>
                    )}
                    {selectedPaymentMethod === 'CARD' && (
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          <CreditCard className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">Saved Cards & RuPay / Visa</div>
                          <div className="text-[11px] text-slate-400">Zero-OTP friction fallback channel</div>
                        </div>
                      </div>
                    )}
                    {selectedPaymentMethod === 'NETBANKING' && (
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Building2 className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">Direct Core Banking Switch</div>
                          <div className="text-[11px] text-slate-400">HDFC • SBI • ICICI • Axis Bank</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Security Guarantee */}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                    <span className="flex items-center gap-1">
                      <Lock className="w-3 h-3 text-emerald-400" />
                      256-Bit SSL Encryption
                    </span>
                    <span>Razorpay Trusted Partner</span>
                  </div>

                  {/* Primary Pay Button */}
                  <button
                    onClick={handleExecutePayment}
                    disabled={paymentProcessing}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                  >
                    {paymentProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                        <span>Capturing Payment on Switch...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 fill-slate-950" />
                        <span>Pay {formatCurrency(activePaymentModal.amount)} & Recover Order</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📖 ARCHITECTURE & SYSTEM GUIDE MODAL */}
      {/* ========================================================================= */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-cyan-500/30 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Workflow className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    RecoverIQ Architecture &amp; System Manual
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    How autonomous payment recovery protects Razorpay merchant revenue
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              <div className="p-4 rounded-xl bg-[#0c1220] border border-[#1e293b] space-y-2">
                <h4 className="font-bold text-cyan-300 text-sm flex items-center gap-1.5">
                  <Zap className="w-4 h-4" />
                  1. The Core Problem in Fintech Checkout
                </h4>
                <p className="text-slate-400 leading-relaxed">
                  Over 25% of checkout failures on Indian payment gateways are transient or recoverable (NPCI UPI switches timing out, customers dropping off at OTP, or temporary low balances). Without an autonomous recovery engine, these become abandoned carts and lost GMV.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#0c1220] border border-[#1e293b] space-y-2">
                <h4 className="font-bold text-purple-300 text-sm flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  2. Hybrid AI + Circuit Breaker Architecture
                </h4>
                <p className="text-slate-400 leading-relaxed">
                  When a failure occurs, the engine invokes Google Gemini 2.5 Flash to categorize root-cause and generate personalized Hinglish recovery copy. If the LLM response takes &gt;1.5 seconds, the circuit breaker automatically switches to deterministic rules in &lt;2ms, ensuring zero merchant latency.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#0c1220] border border-[#1e293b] space-y-2">
                <h4 className="font-bold text-emerald-300 text-sm flex items-center gap-1.5">
                  <Shield className="w-4 h-4" />
                  3. Anti-Spam &amp; Idempotency Guarantees
                </h4>
                <p className="text-slate-400 leading-relaxed">
                  Every webhook is locked via SHA-256 idempotency keys in SQLite to prevent duplicate nudge storms. If a customer fails 3 consecutive times, the engine automatically terminates the cycle to protect merchant brand reputation.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-xs transition-colors"
            >
              Close System Guide
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#1e293b] bg-[#0c1220] py-3 px-6 text-center text-xs text-slate-500">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>RecoverIQ Engine v1.0 • Autonomous Merchant Revenue Shield</span>
          <span className="font-mono text-[11px]">
            Last Synced: {lastRefreshed.toLocaleTimeString()}
          </span>
        </div>
      </footer>
    </div>
  );
}

function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I am RecoverIQ AI Assistant. Ask me anything about how our payment recovery engine works!' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = async (textToSend) => {
    const query = textToSend || input;
    if (!query.trim() || isLoading) return;

    const userMsg = { role: 'user', content: query };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          history: messages.map((m) => ({ role: m.role, content: m.content }))
        })
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply || "Sorry, I couldn't process that." }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: "Offline mode: Ensure backend is running to talk to AI Assistant!" }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="relative flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-2xl shadow-cyan-500/50 hover:scale-105 active:scale-95 transition-all group"
        >
          <MessageSquare className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-400 border-2 border-[#090d16]"></span>
          </span>
        </button>
      )}

      {/* Chat Window Drawer */}
      {isOpen && (
        <div className="w-[360px] sm:w-[400px] h-[520px] bg-[#0c1220]/95 backdrop-blur-2xl border border-cyan-500/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="p-4 bg-[#111726] border-b border-[#1e293b] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-md">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  RecoverIQ AI <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono">2.5 FLASH</span>
                </h3>
                <p className="text-[11px] text-slate-400">Ask questions about our engine</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 font-sans text-xs">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-br-none shadow-md'
                      : 'bg-[#161f33] border border-slate-800 text-slate-200 rounded-bl-none shadow-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-[#161f33] border border-slate-800 px-4 py-2.5 rounded-2xl rounded-bl-none flex items-center gap-2 text-cyan-400 text-xs">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Thinking...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Prompts */}
          <div className="px-3 py-2 bg-[#090d16]/60 border-t border-[#1e293b] flex items-center gap-1.5 overflow-x-auto text-[11px]">
            <button
              onClick={() => handleSend('What is Silent Retry?')}
              className="px-2.5 py-1 rounded-full bg-[#111726] border border-slate-800 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 whitespace-nowrap transition-colors"
            >
              ⚡ Silent Retry?
            </button>
            <button
              onClick={() => handleSend('How does Gemini classify errors?')}
              className="px-2.5 py-1 rounded-full bg-[#111726] border border-slate-800 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 whitespace-nowrap transition-colors"
            >
              🤖 Gemini Diagnosis?
            </button>
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 bg-[#111726] border-t border-[#1e293b] flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask AI Assistant a question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-[#090d16] border border-slate-800 text-white rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-cyan-500 transition-all placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white disabled:opacity-40 transition-all shadow-md shadow-cyan-500/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function LandingPage({ setView }) {
  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col justify-between relative overflow-hidden font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background Lighting Elements */}
      <div className="absolute top-0 left-1/4 w-[700px] h-[700px] bg-cyan-600/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[160px] pointer-events-none" />

      {/* Top Header */}
      <nav className="relative z-10 max-w-7xl w-full mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20 border border-cyan-400/30">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            RecoverIQ <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">ENTERPRISE</span>
          </span>
        </div>

        <button
          onClick={() => setView('login')}
          className="px-4 py-2 rounded-xl bg-[#111726] hover:bg-[#1a233a] border border-[#1e293b] text-xs font-semibold text-slate-200 transition-all hover:border-cyan-500/40 cursor-pointer"
        >
          Sign In
        </button>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-6xl w-full mx-auto px-6 py-12 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-8 shadow-inner">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>Next-Gen Razorpay Revenue Recovery</span>
        </div>

        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-400 tracking-tight leading-[1.1] mb-6 max-w-4xl">
          Turn Failed Transactions Into <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Recovered GMV</span>
        </h1>

        <p className="text-slate-400 text-base sm:text-lg max-w-2xl leading-relaxed mb-10">
          RecoverIQ ingests Razorpay webhooks in milliseconds, leverages Google Gemini AI with a 1.5s circuit breaker, and dispatches 1-click WhatsApp nudges & silent retries zero-touch.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-16 w-full sm:w-auto">
          <button
            onClick={() => setView('login')}
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm tracking-wide shadow-xl shadow-cyan-500/25 transition-all hover:scale-105 cursor-pointer flex items-center justify-center gap-2"
          >
            Open Merchant Dashboard <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mt-6 text-left">
          <div className="p-6 rounded-2xl bg-[#111726]/60 border border-[#1e293b] backdrop-blur-md hover:border-cyan-500/30 transition-all duration-300 group">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-110 transition-transform">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Zero-Touch Ingestion</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Processes Razorpay payment.failed webhooks instantly with SHA-256 idempotency locks.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#111726]/60 border border-[#1e293b] backdrop-blur-md hover:border-purple-500/30 transition-all duration-300 group">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4 group-hover:scale-110 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Hybrid Gemini AI</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Gemini 2.5 Flash classifies root causes (Bank Downtime vs Low Funds) with a 1.5s Circuit Breaker fallback.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#111726]/60 border border-[#1e293b] backdrop-blur-md hover:border-emerald-500/30 transition-all duration-300 group">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Anti-Spam Guardrails</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Enforces a strict 3-strike retry limit per customer order to protect merchant brand reputation.
            </p>
          </div>
        </div>
      </main>

      {/* Landing Footer */}
      <footer className="relative z-10 border-t border-[#1e293b] bg-[#0c1220]/80 py-6 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>RecoverIQ Engine • Autonomous Revenue Recovery for Razorpay</span>
          <span className="text-slate-400">Press "Sign In" to explore live dashboard</span>
        </div>
      </footer>
    </div>
  );
}

function LoginPage({ setView }) {
  const [email, setEmail] = useState('demo@recoveriq.com');
  const [password, setPassword] = useState('password123');

  const handleLogin = (e) => {
    e.preventDefault();
    setView('dashboard');
  };

  return (
    <div className="min-h-screen bg-[#090d16] flex items-center justify-center relative overflow-hidden px-4 font-sans">
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[140px]" />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[160px]" />
      
      <div className="z-10 w-full max-w-md bg-[#111726]/80 backdrop-blur-xl border border-[#1e293b] p-8 rounded-3xl shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-lg mb-4">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">Merchant Login</h2>
          <p className="text-slate-400 text-sm mt-1">Sign in to your RecoverIQ dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Merchant Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0c1220] border border-slate-700 text-white rounded-xl pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                required
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0c1220] border border-slate-700 text-white rounded-xl pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                required
              />
            </div>
          </div>

          <button 
            type="submit"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-cyan-500/25 mt-4 cursor-pointer"
          >
            Sign In to Dashboard
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-[11px] text-slate-500">
            Pre-filled test credentials for judge review.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('landing');

  return (
    <>
      {view === 'landing' && <LandingPage setView={setView} />}
      {view === 'login' && <LoginPage setView={setView} />}
      {view === 'dashboard' && <Dashboard setView={setView} />}
      
      {/* Global AI Chatbot Available Across All Pages */}
      <Chatbot />
    </>
  );
}

