import http from 'http';
import { app } from '../server.js';
import { db, TestimonyRecord, PrayerRequestRecord, UserRecord, VisitRecord } from '../database/store.js';
import { EmailService } from '../services/emailService.js';
import { GateService } from '../services/gateService.js';
import { generateToken } from '../middleware/authMiddleware.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log(`\n=================================================================`);
  console.log(`🧪 HEAVEN'S GATE — SYSTEM BACKEND INTEGRATION TEST SUITE`);
  console.log(`=================================================================\n`);

  // Start test server on ephemeral port
  const testServer = http.createServer(app);
  await new Promise<void>((resolve) => {
    testServer.listen(0, () => resolve());
  });

  const address = testServer.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  console.log(`📡 In-process test server listening at: ${baseUrl}\n`);

  // Generate test JWT tokens
  const testPilgrim: UserRecord = {
    id: 'user-test-pilgrim-001',
    name: 'Sister Mary Wambui',
    phone: '0711998877',
    email: 'mary.wambui@example.com',
    passwordHash: 'dummy-hash',
    role: 'registered_pilgrim',
    totalVisits: 1,
    communicationPreferences: {
      welcomeEmail: true,
      departureEmail: true,
      smsAlerts: true
    },
    createdAt: new Date().toISOString()
  };
  db.users.push(testPilgrim);
  const pilgrimToken = generateToken(testPilgrim);

  const testAdmin: UserRecord = {
    id: 'user-test-admin-001',
    name: 'Pastor Peter Mwangi',
    phone: '0722112233',
    email: 'admin@heavensgate.or.ke',
    passwordHash: 'dummy-hash',
    role: 'system_admin',
    createdAt: new Date().toISOString()
  };
  db.users.push(testAdmin);
  const adminToken = generateToken(testAdmin);

  // Helper for requests
  async function api(path: string, options: RequestInit = {}) {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };
    const res = await fetch(url, { ...options, headers });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, ok: res.ok, data };
  }

  // -----------------------------------------------------------------
  // MODULE A: TESTIMONIES & PRAISE REPORTS
  // -----------------------------------------------------------------

  // Test 1: Public Approved Testimonies Retrieval
  try {
    // Inject a pending testimony to test filtering
    const pendingTestimony: TestimonyRecord = {
      id: 'test-pending-001',
      authorName: 'Unverified Visitor',
      countyOrCity: 'Nakuru',
      title: 'Unreviewed Praise Report',
      content: 'This testimony has not yet been reviewed by the pastoral team.',
      category: 'spiritual_growth',
      status: 'pending',
      likesCount: 0,
      likedBy: [],
      replies: [],
      createdAt: new Date().toISOString()
    };
    db.testimonies.push(pendingTestimony);

    const res = await api('/ministry/testimonies');
    assert(res.ok, `Expected 200 OK, got ${res.status}`);
    assert(Array.isArray(res.data.testimonies), 'Expected array of testimonies');
    
    // Check that NO pending testimony is exposed
    const hasPending = res.data.testimonies.some((t: any) => t.status === 'pending');
    assert(!hasPending, 'Pending testimony must NEVER be exposed publicly');

    results.push({
      name: 'Testimonies: Public endpoint excludes non-approved testimonies',
      passed: true,
      details: `Returned ${res.data.testimonies.length} approved testimonies. Filtered out pending testimony.`
    });
  } catch (err: any) {
    results.push({ name: 'Testimonies: Public endpoint excludes non-approved testimonies', passed: false, error: err.message });
  }

  // Test 2: Specific Published Testimony
  try {
    const existing = db.testimonies.find(t => t.status === 'approved');
    assert(!!existing, 'Expected at least one approved seed testimony');
    const res = await api(`/ministry/testimonies/${existing?.id}`);
    assert(res.ok, `Expected 200 OK, got ${res.status}`);
    assert(res.data.testimony.id === existing?.id, 'Expected returned testimony ID to match');

    results.push({
      name: 'Testimonies: Retrieve specific published testimony by ID',
      passed: true,
      details: `Retrieved testimony '${res.data.testimony.title}' (${res.data.testimony.category})`
    });
  } catch (err: any) {
    results.push({ name: 'Testimonies: Retrieve specific published testimony by ID', passed: false, error: err.message });
  }

  // Test 3: Validation on Testimony Submission
  try {
    // 3a. Invalid submission (too short)
    const badRes = await api('/ministry/testimonies', {
      method: 'POST',
      body: JSON.stringify({ title: 'Hi', content: 'Too short' })
    });
    assert(badRes.status === 400, `Expected 400 Bad Request for short content, got ${badRes.status}`);

    // 3b. Valid submission
    const goodRes = await api('/ministry/testimonies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pilgrimToken}` },
      body: JSON.stringify({
        title: 'Miraculous Healing from Chronic Pain',
        content: 'While praying during the midnight watch at Heavens Gate, the Lord touched my spine and all pain vanished!',
        category: 'healing',
        countyOrCity: 'Nakuru'
      })
    });
    assert(goodRes.status === 201, `Expected 201 Created, got ${goodRes.status}`);
    assert(goodRes.data.testimony.title === 'Miraculous Healing from Chronic Pain', 'Title matched');
    assert(goodRes.data.testimony.category === 'healing', 'Category matched');

    results.push({
      name: 'Testimonies: Content validation and authenticated submission',
      passed: true,
      details: `Rejected short input with 400; successfully created testimony with ID: ${goodRes.data.testimony.id}`
    });
  } catch (err: any) {
    results.push({ name: 'Testimonies: Content validation and authenticated submission', passed: false, error: err.message });
  }

  // Test 4: Persistent Likes and Duplicate Prevention
  try {
    const targetTestimony = db.testimonies.find(t => t.status === 'approved')!;
    const initialLikes = targetTestimony.likesCount || 0;

    // 4a. Add like
    const likeRes1 = await api(`/ministry/testimonies/${targetTestimony.id}/like`, {
      method: 'POST',
      body: JSON.stringify({ userId: 'liker-device-xyz' })
    });
    assert(likeRes1.ok, `Expected 200 OK, got ${likeRes1.status}`);
    assert(likeRes1.data.alreadyLiked === false, 'Expected alreadyLiked to be false on first like');
    assert(likeRes1.data.likesCount === initialLikes + 1, 'Likes count should increment by 1');

    // 4b. Duplicate like attempt from same userId
    const likeRes2 = await api(`/ministry/testimonies/${targetTestimony.id}/like`, {
      method: 'POST',
      body: JSON.stringify({ userId: 'liker-device-xyz' })
    });
    assert(likeRes2.ok, `Expected 200 OK on duplicate like`);
    assert(likeRes2.data.alreadyLiked === true, 'Expected alreadyLiked to be true on second like');
    assert(likeRes2.data.likesCount === initialLikes + 1, 'Likes count must NOT increment twice');

    // 4c. Unlike
    const unlikeRes = await api(`/ministry/testimonies/${targetTestimony.id}/like`, {
      method: 'DELETE',
      body: JSON.stringify({ userId: 'liker-device-xyz' })
    });
    assert(unlikeRes.ok, `Expected 200 OK on unlike`);
    assert(unlikeRes.data.likesCount === initialLikes, 'Likes count should return to original');

    results.push({
      name: 'Testimonies: Likes registration, duplicate prevention, and unlike',
      passed: true,
      details: `Initial: ${initialLikes} -> Like 1: ${initialLikes + 1} -> Duplicate: ${initialLikes + 1} (suppressed) -> Unlike: ${initialLikes}`
    });
  } catch (err: any) {
    results.push({ name: 'Testimonies: Likes registration, duplicate prevention, and unlike', passed: false, error: err.message });
  }

  // Test 5: Comments Validation and Retrieval
  try {
    const targetTestimony = db.testimonies.find(t => t.status === 'approved')!;

    // 5a. Empty comment rejected
    const emptyCommentRes = await api(`/ministry/testimonies/${targetTestimony.id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ authorName: 'John', comment: '   ' })
    });
    assert(emptyCommentRes.status === 400, `Expected 400 for empty comment, got ${emptyCommentRes.status}`);

    // 5b. Valid comment posted
    const goodCommentRes = await api(`/ministry/testimonies/${targetTestimony.id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ authorName: 'Brother Paul', comment: 'Amen! God is faithful!' })
    });
    assert(goodCommentRes.status === 201, `Expected 201 for valid comment, got ${goodCommentRes.status}`);
    assert(goodCommentRes.data.reply.comment === 'Amen! God is faithful!', 'Comment text matched');

    // 5c. Retrieve comments
    const listCommentsRes = await api(`/ministry/testimonies/${targetTestimony.id}/comments`);
    assert(listCommentsRes.ok, `Expected 200 for comments list`);
    assert(listCommentsRes.data.comments.length > 0, 'Expected non-empty comments list');

    results.push({
      name: 'Testimonies: Comment validation, posting, and retrieval',
      passed: true,
      details: `Empty comment rejected; comment posted with ID: ${goodCommentRes.data.reply.id}; comments retrieved: ${listCommentsRes.data.count}`
    });
  } catch (err: any) {
    results.push({ name: 'Testimonies: Comment validation, posting, and retrieval', passed: false, error: err.message });
  }

  // -----------------------------------------------------------------
  // MODULE B: PRAYER REQUESTS & PRIVACY BOUNDARIES
  // -----------------------------------------------------------------

  // Test 6: Prayer Request Submission & Duplicate Prevention
  try {
    const reqPayload = {
      visitorName: 'Sister Mary Wambui',
      phone: '0711998877',
      email: 'mary.wambui@example.com',
      category: 'Healing & Deliverance',
      requestText: 'Please intercede for complete restoration of my mother health in hospital.',
      isConfidential: true
    };

    // 6a. Valid submission
    const res1 = await api('/ministry/prayer-requests', {
      method: 'POST',
      body: JSON.stringify(reqPayload)
    });
    assert(res1.status === 201, `Expected 201 Created, got ${res1.status}`);
    assert(res1.data.prayerRequest.isConfidential === true, 'Confidential flag preserved');

    // 6b. Duplicate submission within 60s
    const res2 = await api('/ministry/prayer-requests', {
      method: 'POST',
      body: JSON.stringify(reqPayload)
    });
    assert(res2.status === 409, `Expected 409 Conflict for duplicate submission within 60s, got ${res2.status}`);

    results.push({
      name: 'Prayer Requests: Submission, confidentiality, and 60-second duplicate rejection',
      passed: true,
      details: `First request accepted (ID: ${res1.data.prayerRequest.id}); duplicate request rejected with 409 Conflict.`
    });
  } catch (err: any) {
    results.push({ name: 'Prayer Requests: Submission, confidentiality, and 60-second duplicate rejection', passed: false, error: err.message });
  }

  // Test 7: Privacy Boundaries on GET /messages/my-messages (BR-11)
  try {
    // 7a. Unauthenticated and no identifier -> 401
    const unauthRes = await api('/messages/my-messages');
    assert(unauthRes.status === 401, `Expected 401 Unauthorized without auth or identifier, got ${unauthRes.status}`);

    // 7b. Query by Mary's phone
    const maryRes = await api('/messages/my-messages?identifier=0711998877');
    assert(maryRes.ok, `Expected 200 OK for Mary's identifier`);
    assert(maryRes.data.messages.length > 0, "Expected Mary's messages to be returned");

    // Verify all returned requests belong exclusively to Mary
    const allBelongToMary = maryRes.data.messages.every((m: any) => 
      m.phone === '0711998877' || (m.email && m.email === 'mary.wambui@example.com')
    );
    assert(allBelongToMary, 'Strict BR-11 Privacy: Returned messages must belong exclusively to caller');

    // 7c. Query by authenticated JWT
    const jwtRes = await api('/messages/my-messages', {
      headers: { Authorization: `Bearer ${pilgrimToken}` }
    });
    assert(jwtRes.ok, `Expected 200 OK for JWT authenticated request`);
    assert(jwtRes.data.messages.length > 0, 'Expected messages returned via JWT auth');

    results.push({
      name: 'Messages: Strict BR-11 privacy filtering on /messages/my-messages',
      passed: true,
      details: `Unauthorized blocked (401); Phone identifier query returned ${maryRes.data.messages.length} private requests; JWT auth verified.`
    });
  } catch (err: any) {
    results.push({ name: 'Messages: Strict BR-11 privacy filtering on /messages/my-messages', passed: false, error: err.message });
  }

  // -----------------------------------------------------------------
  // MODULE C: VISITOR EMAILING & AUTOMATION
  // -----------------------------------------------------------------

  // Test 8: Welcome Email on Gate Check-in
  try {
    const testBookingRef = `HG-TEST-${Date.now().toString().slice(-4)}`;
    const emailResult = await EmailService.sendWelcomeEmail({
      visitorName: 'Brother David Ochieng',
      visitorEmail: 'david.ochieng@example.com',
      bookingReference: testBookingRef,
      ticketReference: `TKT-${testBookingRef}`
    });

    assert(emailResult.success === true, 'Welcome email dispatch should succeed');
    assert(emailResult.log.emailType === 'welcome', 'Email type must be welcome');
    assert(emailResult.log.bookingReference === testBookingRef, 'Booking reference matched');

    // Verify logged in store
    const logInStore = db.emailLogs.find(l => l.id === emailResult.log.id);
    assert(!!logInStore, 'Welcome email record must be persisted in db.emailLogs');

    results.push({
      name: 'Email Automation: Welcome email generated on gate admission',
      passed: true,
      details: `Welcome email logged with status '${emailResult.log.status}' for ${emailResult.log.recipientEmail}`
    });
  } catch (err: any) {
    results.push({ name: 'Email Automation: Welcome email generated on gate admission', passed: false, error: err.message });
  }

  // Test 9: Duplicate Welcome Email Suppression
  try {
    const testBookingRef = `HG-DUP-${Date.now().toString().slice(-4)}`;
    
    // First send
    const res1 = await EmailService.sendWelcomeEmail({
      visitorName: 'Sister Grace Akinyi',
      visitorEmail: 'grace.akinyi@example.com',
      bookingReference: testBookingRef
    });
    assert(res1.success === true, 'First send should succeed');
    assert(res1.duplicate !== true, 'First send should not be duplicate');

    // Repeated send for same booking reference
    const res2 = await EmailService.sendWelcomeEmail({
      visitorName: 'Sister Grace Akinyi',
      visitorEmail: 'grace.akinyi@example.com',
      bookingReference: testBookingRef
    });
    assert(res2.success === true, 'Duplicate response should succeed idempotently');
    assert(res2.duplicate === true, 'Duplicate email must be detected and suppressed');

    results.push({
      name: 'Email Automation: Duplicate email suppression per booking',
      passed: true,
      details: `First send logged; second send detected as duplicate and suppressed without error.`
    });
  } catch (err: any) {
    results.push({ name: 'Email Automation: Duplicate email suppression per booking', passed: false, error: err.message });
  }

  // Test 10: Departure Thank-You Email on Gate Checkout
  try {
    const testBookingRef = `HG-OUT-${Date.now().toString().slice(-4)}`;
    const checkoutEmail = await EmailService.sendThankYouEmail({
      visitorName: 'Brother David Ochieng',
      visitorEmail: 'david.ochieng@example.com',
      bookingReference: testBookingRef
    });

    assert(checkoutEmail.success === true, 'Thank-you email should succeed');
    assert(checkoutEmail.log.emailType === 'thank_you', 'Email type must be thank_you');

    // Verify duplicate thank-you suppressed
    const repeatCheckout = await EmailService.sendThankYouEmail({
      visitorName: 'Brother David Ochieng',
      visitorEmail: 'david.ochieng@example.com',
      bookingReference: testBookingRef
    });
    assert(repeatCheckout.duplicate === true, 'Duplicate thank-you email must be suppressed');

    results.push({
      name: 'Email Automation: Departure thank-you email and duplicate suppression',
      passed: true,
      details: `Thank-you email sent; repeat checkout suppressed duplicate.`
    });
  } catch (err: any) {
    results.push({ name: 'Email Automation: Departure thank-you email and duplicate suppression', passed: false, error: err.message });
  }

  // Test 11: Invalid Email Address Non-Breaking Handling
  try {
    const invalidRes = await EmailService.sendWelcomeEmail({
      visitorName: 'Pilgrim No Email',
      visitorEmail: 'invalid-email-string',
      bookingReference: 'HG-INVALID-001'
    });

    assert(invalidRes.success === false, 'Invalid email should return success: false');
    assert(invalidRes.log.status === 'failed', 'Invalid email status should be failed');
    assert(typeof invalidRes.log.failureReason === 'string', 'Failure reason must be documented');

    // Verify admin email log inspection
    const adminLogsRes = await api('/admin/email-status');
    assert(adminLogsRes.ok, 'Admin email-status endpoint should return 200');
    assert(adminLogsRes.data.failedCount > 0, 'Failed count should be recorded in metrics');

    results.push({
      name: 'Email Automation: Safe failure handling on invalid email and admin log inspection',
      passed: true,
      details: `Invalid email gracefully logged as 'failed'; Admin /admin/email-status reported ${adminLogsRes.data.total} total logs.`
    });
  } catch (err: any) {
    results.push({ name: 'Email Automation: Safe failure handling on invalid email and admin log inspection', passed: false, error: err.message });
  }

  // -----------------------------------------------------------------
  // MODULE D: MEMBER MANAGEMENT & VISIT HISTORY
  // -----------------------------------------------------------------

  // Test 12: Member Management Search & Classification (First-Time vs Returning)
  try {
    // Inject a returning member
    const returningMember: UserRecord = {
      id: 'member-returning-001',
      name: 'Mama Sarah Muthoni',
      phone: '0722334455',
      email: 'sarah.muthoni@example.com',
      nationalId: '12345678',
      passwordHash: 'dummy',
      role: 'registered_pilgrim',
      totalVisits: 3, // Returning visitor
      communicationPreferences: { welcomeEmail: true, departureEmail: true, smsAlerts: true },
      createdAt: new Date().toISOString()
    };
    db.users.push(returningMember);

    // Inject 2 visit records for Sarah
    db.visits.push({
      id: 'visit-sarah-01',
      memberId: returningMember.id,
      visitorName: returningMember.name,
      visitorPhone: returningMember.phone,
      bookingId: 'b-sarah-01',
      bookingReference: 'HG-2026-SARAH1',
      checkInDate: '2026-02-10',
      checkOutDate: '2026-02-12',
      status: 'checked_out',
      createdAt: '2026-02-10T08:00:00Z',
      updatedAt: '2026-02-12T10:00:00Z'
    });
    db.visits.push({
      id: 'visit-sarah-02',
      memberId: returningMember.id,
      visitorName: returningMember.name,
      visitorPhone: returningMember.phone,
      bookingId: 'b-sarah-02',
      bookingReference: 'HG-2026-SARAH2',
      checkInDate: '2026-03-01',
      checkOutDate: '2026-03-03',
      status: 'checked_out',
      createdAt: '2026-03-01T08:00:00Z',
      updatedAt: '2026-03-03T10:00:00Z'
    });

    // 12a. Query all members
    const membersRes = await api('/admin/members?q=Sarah');
    assert(membersRes.ok, `Expected 200 OK for members query, got ${membersRes.status}`);
    const foundMember = membersRes.data.members.find((m: any) => m.id === returningMember.id);
    assert(!!foundMember, 'Sarah Muthoni should be found in search');
    assert(foundMember.classification === 'returning', `Expected classification 'returning', got '${foundMember.classification}'`);
    assert(foundMember.totalVisits >= 2, `Expected totalVisits >= 2, got ${foundMember.totalVisits}`);

    // 12b. Query Sarah's profile
    const profileRes = await api(`/admin/members/${returningMember.id}`);
    assert(profileRes.ok, `Expected 200 OK for member profile`);
    assert(profileRes.data.member.name === 'Mama Sarah Muthoni', 'Member name matched');

    // 12c. Query chronological separate visit records
    const visitsRes = await api(`/admin/members/${returningMember.id}/visits`);
    assert(visitsRes.ok, `Expected 200 OK for member visits`);
    assert(visitsRes.data.visits.length >= 2, `Expected at least 2 chronological visit records, got ${visitsRes.data.visits.length}`);
    
    // Check chronological order (most recent first)
    const v1Date = new Date(visitsRes.data.visits[0].checkInDate).getTime();
    const v2Date = new Date(visitsRes.data.visits[1].checkInDate).getTime();
    assert(v1Date >= v2Date, 'Visits must be sorted in reverse chronological order');

    // 12d. Update member communication preferences
    const patchRes = await api(`/admin/members/${returningMember.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        communicationPreferences: { welcomeEmail: true, departureEmail: false, smsAlerts: true }
      })
    });
    assert(patchRes.ok, `Expected 200 OK for member update`);
    assert(patchRes.data.member.communicationPreferences.departureEmail === false, 'Updated preference reflected');

    results.push({
      name: 'Member Management: Search, returning visitor classification, and chronological visit history',
      passed: true,
      details: `Found member; classified as 'returning'; retrieved ${visitsRes.data.visits.length} separate chronological visits; updated comms preferences.`
    });
  } catch (err: any) {
    results.push({ name: 'Member Management: Search, returning visitor classification, and chronological visit history', passed: false, error: err.message });
  }

  // Test 13: Pastoral Moderation Workflow on Testimonies
  try {
    const pendingTestimony = db.testimonies.find(t => t.status === 'pending');
    assert(!!pendingTestimony, 'Expected pending testimony in store');

    // 13a. Admin view all testimonies
    const adminTestimoniesRes = await api('/admin/testimonies');
    assert(adminTestimoniesRes.ok, 'Expected 200 for admin testimonies');
    assert(adminTestimoniesRes.data.testimonies.some((t: any) => t.id === pendingTestimony?.id), 'Pending testimony visible in admin list');

    // 13b. Moderate testimony (approve)
    const modRes = await api(`/admin/testimonies/${pendingTestimony?.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved', moderatorName: 'Pastor Peter Mwangi' })
    });
    assert(modRes.ok, `Expected 200 OK on testimony approval, got ${modRes.status}`);
    assert(modRes.data.testimony.status === 'approved', 'Status updated to approved');

    results.push({
      name: 'Testimonies Moderation: Admin review list and status update workflow',
      passed: true,
      details: `Testimony ID ${pendingTestimony?.id} reviewed and updated to 'approved' by pastoral moderator.`
    });
  } catch (err: any) {
    results.push({ name: 'Testimonies Moderation: Admin review list and status update workflow', passed: false, error: err.message });
  }

  // Clean up server
  await new Promise<void>((resolve) => {
    testServer.close(() => resolve());
  });

  // -----------------------------------------------------------------
  // SUMMARY REPORT
  // -----------------------------------------------------------------
  console.log(`\n=================================================================`);
  console.log(`📊 TEST SUITE EXECUTION SUMMARY`);
  console.log(`=================================================================`);

  let passedCount = 0;
  for (const r of results) {
    if (r.passed) {
      passedCount++;
      console.log(`\x1b[32m✔ PASS\x1b[0m ${r.name}`);
      if (r.details) console.log(`       \x1b[90m${r.details}\x1b[0m`);
    } else {
      console.log(`\x1b[31m✖ FAIL\x1b[0m ${r.name}`);
      if (r.error) console.log(`       \x1b[31mError: ${r.error}\x1b[0m`);
    }
  }

  console.log(`\nResults: ${passedCount} / ${results.length} tests passed.`);
  console.log(`=================================================================\n`);

  if (passedCount !== results.length) {
    process.exit(1);
  }
  process.exit(0);
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
