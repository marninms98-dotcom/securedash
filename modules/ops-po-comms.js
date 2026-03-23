// ════════════════════════════════════════════════════════════
// PO MANAGEMENT (Delete, Invoice, Paid, Attachments)
// ════════════════════════════════════════════════════════════

// BUG 2: Delete PO
function deletePO(poId, poNumber, supplier, canDelete) {
  if (!canDelete) {
    showToast('Cannot delete — PO already sent to supplier. Use Cancel instead.', 'warning');
    return;
  }
  if (!confirm('Delete ' + poNumber + ' for ' + supplier + '? This cannot be undone.')) return;
  opsPost('delete_po', { id: poId }).then(function() {
    showToast(poNumber + ' deleted', 'success');
    loadMaterials();
  }).catch(function(e) {
    showToast('Error: ' + e.message, 'warning');
  });
}

// FEATURE 7: Mark invoice received
// TODO: Add invoice_received_at (timestamptz), paid_at (timestamptz), xero_bill_id (text) columns to purchase_orders table
// TODO: Add 'invoice_received_at', 'paid_at' to the allowed fields in updatePO() edge function
async function markPOInvoiceReceived(poId) {
  if (!confirm('Mark invoice received for this PO?')) return;
  try {
    // Use update_po to set status field as a proxy until column exists
    await opsPost('update_po', { id: poId, notes: '[Invoice received ' + new Date().toLocaleDateString('en-AU') + ']' });
    showToast('Invoice marked as received', 'success');
    loadMaterials();
  } catch (e) {
    showToast('Error: ' + e.message, 'warning');
  }
}

// FEATURE 7: Mark paid
async function markPOPaid(poId) {
  if (!confirm('Mark this PO as paid?')) return;
  try {
    await opsPost('update_po', { id: poId, notes: '[Paid ' + new Date().toLocaleDateString('en-AU') + ']' });
    showToast('PO marked as paid', 'success');
    loadMaterials();
  } catch (e) {
    showToast('Error: ' + e.message, 'warning');
  }
}

// ── Generate PO PDF (branded, using jsPDF + SW_BRAND helpers) ──
// Returns a base64 data URL string, or null on failure.
async function generatePOPDF(poId) {
  var jsPDF = window.jspdf ? window.jspdf.jsPDF : null;
  if (!jsPDF) { console.log('jsPDF not loaded'); return null; }

  var po = _allPOs.find(function(p) { return p.id === poId; });
  if (!po) return null;

  var B = window.SW_BRAND;
  var P = B.pdf;
  var M = B.PDF_M;
  var W = B.PDF_W;
  var CW = B.PDF_CW;
  var doc = new jsPDF({ unit: 'mm', format: 'a4' });
  var fmt = P.fmt;

  // Job data
  var jobAddress = '';
  var siteContact = '';
  if (_currentJobData && _currentJobData.job) {
    var j = _currentJobData.job;
    jobAddress = [j.site_address, j.site_suburb, 'WA', j.site_postcode].filter(Boolean).join(', ');
    siteContact = j.crew_lead || '';
  }

  var dateStr = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  var deliveryStr = po.delivery_date ? new Date(po.delivery_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'TBC';

  // ── Header ──
  var logoPng = null;
  try { logoPng = await B.getLogoPNG(); } catch(e) {}
  var y = P.header(doc, logoPng, 'PURCHASE ORDER', po.po_number || '');

  // ── PO details card ──
  var pairs = [
    ['PO Number', po.po_number || ''],
    ['Date', dateStr],
    ['Supplier', po.supplier_name || ''],
    ['Job Ref', po.job_number || ''],
    ['Required By', deliveryStr],
    ['Reference', po.reference || ''],
  ];
  y = P.infoCard(doc, y, pairs, { cols: 2 });

  // ── Deliver To section ──
  if (jobAddress) {
    y = P.subSection(doc, y, 'DELIVER TO');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, B.SW_DARK);
    doc.text(jobAddress, M, y);
    y += 5;
    if (siteContact) {
      doc.setTextColor.apply(doc, B.SW_MID);
      doc.setFontSize(8);
      doc.text('Site contact: ' + siteContact, M, y);
      y += 5;
    }
    y += 2;
  }

  // ── Line Items Table ──
  y = P.sectionHeader(doc, y, 'ORDER ITEMS');

  var lineItems = po.line_items || [];
  // Table header
  doc.setFillColor(240, 244, 247);
  doc.rect(M, y, CW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor.apply(doc, B.SW_MID);
  var cols = [M + 2, M + 90, M + 110, M + 132, M + 158];
  doc.text('Description', cols[0], y + 5);
  doc.text('Qty', cols[1], y + 5);
  doc.text('Unit', cols[2], y + 5);
  doc.text('Unit Price', cols[3], y + 5);
  doc.text('Total', cols[4], y + 5);
  y += 9;

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  var subtotal = 0;
  lineItems.forEach(function(item, i) {
    y = P.checkPage(doc, y, 8);
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 252);
      doc.rect(M, y - 3.5, CW, 7, 'F');
    }
    var desc = item.description || item.item || item.desc || '';
    var qty = item.quantity || item.qty || 0;
    var unit = item.unit || 'ea';
    var price = item.unit_price || item.price || 0;
    var total = qty * price;
    subtotal += total;

    doc.setTextColor.apply(doc, B.SW_DARK);
    // Truncate long descriptions
    var descText = desc.length > 50 ? desc.substring(0, 47) + '...' : desc;
    doc.text(descText, cols[0], y);
    doc.text(String(qty), cols[1], y);
    doc.text(unit, cols[2], y);
    doc.text('$' + fmt(price), cols[3], y);
    doc.setFont('helvetica', 'bold');
    doc.text('$' + fmt(total), cols[4], y);
    doc.setFont('helvetica', 'normal');
    y += 7;
  });

  // Totals
  y += 2;
  doc.setDrawColor.apply(doc, B.SW_MID);
  doc.setLineWidth(0.3);
  doc.line(cols[3], y - 2, M + CW - 2, y - 2);
  var gst = subtotal * 0.1;
  var grandTotal = subtotal + gst;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor.apply(doc, B.SW_MID);
  doc.text('Subtotal', cols[3], y);
  doc.setTextColor.apply(doc, B.SW_DARK);
  doc.text('$' + fmt(subtotal), cols[4], y);
  y += 5;
  doc.setTextColor.apply(doc, B.SW_MID);
  doc.text('GST (10%)', cols[3], y);
  doc.setTextColor.apply(doc, B.SW_DARK);
  doc.text('$' + fmt(gst), cols[4], y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor.apply(doc, B.SW_DARK);
  doc.text('TOTAL', cols[3], y);
  doc.setTextColor.apply(doc, B.SW_ORANGE);
  doc.text('$' + fmt(grandTotal), cols[4], y);
  y += 8;

  // ── Notes ──
  if (po.notes) {
    y = P.checkPage(doc, y, 20);
    y = P.subSection(doc, y, 'NOTES');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor.apply(doc, B.SW_DARK);
    var noteLines = doc.splitTextToSize(po.notes, CW - 4);
    doc.text(noteLines, M, y);
    y += noteLines.length * 4 + 4;
  }

  // ── Confirmation request ──
  y = P.checkPage(doc, y, 15);
  doc.setFillColor(240, 244, 247);
  doc.rect(M, y, CW, 10, 'F');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor.apply(doc, B.SW_MID);
  doc.text('Please confirm receipt and expected delivery date.', M + 4, y + 6);
  y += 14;

  // ── Footer ──
  P.addPageNumbers(doc);

  // Return as base64 blob
  return doc.output('datauristring');
}

// Upload PO PDF to Supabase Storage and return the public URL
async function uploadPOPDF(poId, dataUri) {
  if (!dataUri || !window.SUPABASE_URL) return null;
  try {
    // Convert data URI to blob
    var byteString = atob(dataUri.split(',')[1]);
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);
    for (var i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    var blob = new Blob([ab], { type: 'application/pdf' });

    var po = _allPOs.find(function(p) { return p.id === poId; });
    var filename = (po ? po.po_number : 'PO') + '.pdf';
    var path = 'po-documents/' + poId + '/' + filename;

    // Upload via Supabase Storage (use cloud.js client)
    var cloud = window.SECUREWORKS_CLOUD;
    if (!cloud || !cloud.supabase) return null;

    var { data, error } = await cloud.supabase.storage
      .from('po-documents')
      .upload(path, blob, { contentType: 'application/pdf', upsert: true });

    if (error) {
      console.log('[PO PDF] Upload error:', error.message);
      return null;
    }

    var { data: urlData } = cloud.supabase.storage.from('po-documents').getPublicUrl(path);
    return urlData ? urlData.publicUrl : null;
  } catch(e) {
    console.log('[PO PDF] Upload failed:', e.message);
    return null;
  }
}

// Approve & Send PO — pushes to Xero then emails supplier
async function approveAndSendPO(poId, btnEl) {
  if (!confirm('Approve this PO and send to supplier?')) return;
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Sending...'; }
  try {
    await opsPost('push_po_to_xero', { id: poId, status: 'AUTHORISED' });
    await opsPost('email_po', { id: poId });
    showToast('PO approved and sent to supplier', 'success');
    loadMaterials();
  } catch(e) {
    showToast('Error: ' + e.message, 'warning');
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Approve & Send'; }
  }
}

// Toggle expandable PO review card
function togglePOCard(poId) {
  var body = document.getElementById('poBody' + poId);
  var chevron = document.getElementById('poChevron' + poId);
  if (!body) return;
  if (body.style.display === 'none') {
    body.style.display = '';
    chevron.innerHTML = '&#9650;';
    // Populate supplier dropdown if not already done
    var sel = document.getElementById('poSupplierPick' + poId);
    if (sel && sel.options.length <= 1) {
      if (_suppliers && _suppliers.length) {
        _suppliers.forEach(function(s) {
          var opt = document.createElement('option');
          opt.value = s.name;
          opt.textContent = s.name;
          sel.appendChild(opt);
        });
      } else {
        // Load suppliers then populate
        loadSupplierList().then(function() {
          if (_suppliers && _suppliers.length) {
            _suppliers.forEach(function(s) {
              var opt = document.createElement('option');
              opt.value = s.name;
              opt.textContent = s.name;
              sel.appendChild(opt);
            });
          }
        });
      }
    }
    // Pre-select supplier if PO already has one
    var card = document.getElementById('poCard' + poId);
    if (sel && card) {
      var existing = card.getAttribute('data-supplier');
      if (existing && sel.value === '') {
        sel.value = existing;
      }
    }
  } else {
    body.style.display = 'none';
    chevron.innerHTML = '&#9660;';
  }
}

// Quick approve PO from review card
async function quickApprovePO(poId, sendToSupplier) {
  var supplierEl = document.getElementById('poSupplierPick' + poId);
  var supplier = supplierEl ? supplierEl.value : '';
  var dateEl = document.getElementById('poDeliveryPick' + poId);
  var deliveryDate = dateEl ? dateEl.value : '';

  if (!supplier) {
    showToast('Please select a supplier first', 'warning');
    return;
  }

  try {
    // Update PO with supplier and delivery date
    await opsPost('update_po', {
      id: poId,
      supplier_name: supplier,
      delivery_date: deliveryDate || null,
      status: 'draft'
    });

    if (sendToSupplier) {
      // Push as authorised and email
      await opsPost('push_po_to_xero', { id: poId, status: 'AUTHORISED' });
      await opsPost('email_po', { id: poId });
      showToast('PO approved, synced to Xero, and emailed to ' + supplier, 'success');
    } else {
      // Push as draft to Xero
      await opsPost('push_po_to_xero', { id: poId, status: 'draft' });
      showToast('PO saved as draft in Xero', 'success');
    }

    // Refresh the job detail view
    if (_currentJobId) {
      openJobDetail(_currentJobId);
    }
  } catch(e) {
    showToast('Error: ' + e.message, 'warning');
  }
}

// Approve PO + open compose modal (for "Approve & Send to Supplier" on draft review cards)
async function approveAndComposePO(poId) {
  var supplierEl = document.getElementById('poSupplierPick' + poId);
  var supplier = supplierEl ? supplierEl.value : '';
  var dateEl = document.getElementById('poDeliveryPick' + poId);
  var deliveryDate = dateEl ? dateEl.value : '';

  if (!supplier) {
    showToast('Please select a supplier first', 'warning');
    return;
  }

  try {
    // Save supplier + delivery date on the PO
    await opsPost('update_po', {
      id: poId,
      supplier_name: supplier,
      delivery_date: deliveryDate || null,
      status: 'approved'
    });

    // Sync to Xero as draft (actual send happens via compose modal email)
    try {
      await opsPost('push_po_to_xero', { id: poId, status: 'draft' });
    } catch (e) { /* Xero sync non-critical */ }

    // Refresh POs so compose modal sees updated data
    var data = await opsFetch('list_pos');
    _allPOs = data.purchase_orders || [];

    // Open the compose modal pre-filled
    openPOEmailCompose(poId);
  } catch(e) {
    showToast('Error: ' + e.message, 'warning');
  }
}

// Mark PO as delivered (manual — Shaun clicks on Confirmed cards)
// Future: Trade app materials_check can trigger this
async function markPODelivered(poId, btnEl) {
  if (!confirm('Mark this PO as delivered?')) return;
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Updating...'; }
  try {
    await opsPost('update_po', { id: poId, status: 'billed' });
    showToast('PO marked as delivered', 'success');
    loadMaterials();
    if (_currentJobId) openJobDetail(_currentJobId);
  } catch(e) {
    showToast('Error: ' + e.message, 'warning');
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Mark Delivered'; }
  }
}

// FEATURE 9: Attachment support (TODOs)
// TODO: Create po_attachments table: id (uuid), po_id (uuid FK), filename (text), storage_url (text),
//       file_type (text), attachment_type (text — Quote/Invoice/Delivery Docket/Credit Note/Other),
//       uploaded_by (uuid FK), created_at (timestamptz)
// TODO: Add ops-api actions: upload_po_attachment, list_po_attachments, delete_po_attachment
// TODO: Use Supabase Storage bucket 'po_attachments' with path: po_attachments/[po_id]/[filename]
// TODO: On PO edit modal, add 'Attachments' section with file picker + type dropdown
// TODO: When 'Mark Invoice Received' is clicked, prompt to attach the invoice document

// ════════════════════════════════════════════════════════════
// CLIENT COMMS (Conversation Thread + Compose)
// ════════════════════════════════════════════════════════════

var _commsMode = 'sms'; // 'sms' | 'email'
var _commsGHLBase = window.SUPABASE_URL + '/functions/v1/ghl-proxy';

// GHL phone numbers — auto-select by job type
var SW_PHONE_NUMBERS = [
  { number: '+61489267771', display: '0489 267 771', label: 'SecureWorks Group Admin', types: [] },
  { number: '+61489267772', display: '0489 267 772', label: 'SecureWorks Fencing Sales', types: ['fencing'] },
  { number: '+61489267774', display: '0489 267 774', label: 'SecureWorks Patios', types: ['patio', 'decking'] },
  { number: '+61489267776', display: '0489 267 776', label: 'SecureWorks Group Ops', types: ['miscellaneous'] },
  { number: '+61489267778', display: '0489 267 778', label: 'SecureWorks Fencing Mgmt', types: [] },
];

function getCommsNumberForJob(job) {
  // Ops dashboard always sends from the Ops number
  return SW_PHONE_NUMBERS.find(function(p) { return p.number === '+61489267776'; }) || SW_PHONE_NUMBERS[0];
}

var COMMS_TEMPLATES = {
  scheduled:   'Hi {firstName}, your {jobType} project at {address} is scheduled for {date}. Our team will arrive between 7–8am. Please ensure clear access to the work area. Thanks, SecureWorks WA',
  materials:   'Hi {firstName}, materials are arriving for your {jobType} project at {address}. Build is on track. Thanks, SecureWorks WA',
  complete:    'Hi {firstName}, great news — your {jobType} project at {address} is complete! Your completion report is attached. Thanks for choosing SecureWorks WA.',
  payment:     'Hi {firstName}, just a friendly reminder that invoice {invoiceNumber} is now overdue. Please let us know if you have any questions. Thanks, SecureWorks WA',
  follow_up:   'Hi {firstName}, just checking in on the quote we sent for your {jobType} project. Happy to answer any questions. Thanks, SecureWorks WA',
};

function renderCommsView(data) {
  var j = data.job;
  var container = document.getElementById('jdComms');
  var pos = data.purchase_orders || [];

  var html = '';

  // Channel tabs: Client | Suppliers | Email Log
  html += '<div class="comms-channel-tabs">';
  html += '<button class="comms-channel-tab active" id="commsTabClient" onclick="setCommsChannel(\'client\')">Client</button>';
  html += '<button class="comms-channel-tab" id="commsTabSuppliers" onclick="setCommsChannel(\'suppliers\')">Suppliers' + (pos.length ? ' (' + pos.length + ')' : '') + '</button>';
  html += '<button class="comms-channel-tab" id="commsTabEmail" onclick="setCommsChannel(\'email\')">Email Log</button>';
  html += '</div>';

  // ── Client View ──
  html += '<div id="commsClientView">';

  if (!j.ghl_contact_id) {
    html += '<div class="comms-empty">No GHL contact linked to this job.<br><span style="font-size:11px;">Link a contact via the scope tool or GHL.</span></div>';
  } else {
    // Header: phone + call button
    html += '<div class="comms-header">';
    if (j.client_phone) {
      html += '<span class="phone-num">' + j.client_phone + '</span>';
      if (_isMobile) {
        html += '<a href="tel:' + j.client_phone + '" class="comms-call-btn" onclick="scheduleCallLog()">&#9742; Call</a>';
      } else {
        html += '<button class="comms-call-btn" onclick="scheduleCallLog()">&#9742; Call</button>';
      }
    }
    html += '<span style="flex:1;"></span>';
    html += '<a href="https://app.maxlead.com.au/v2/location/' + GHL_LOCATION_ID + '/contacts/' + j.ghl_contact_id + '" target="_blank" style="font-size:11px;color:var(--sw-text-sec);">View in GHL &#8599;</a>';
    html += '</div>';

    // Thread (placeholder — loaded async)
    html += '<div id="commsThread" class="comms-thread"><div class="loading" style="text-align:center;padding:20px;">Loading conversation...</div></div>';

    // Compose area
    html += '<div class="comms-compose">';

    // Sending identity — auto-select number by job type
    var autoNum = getCommsNumberForJob(j);
    html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--sw-light);margin-bottom:8px;font-size:12px;">';
    html += '<span style="color:var(--sw-mid);font-weight:600;">From:</span>';
    html += '<select id="commsSenderSelect" style="font-size:12px;font-weight:600;color:var(--sw-dark);border:1px solid var(--sw-border);border-radius:3px;padding:3px 8px;background:var(--sw-card);flex:1;">';
    SW_PHONE_NUMBERS.forEach(function(pn) {
      var sel = pn.number === autoNum.number ? ' selected' : '';
      html += '<option value="' + pn.number + '"' + sel + '>' + escapeHtml(pn.label) + ' — ' + pn.display + '</option>';
    });
    html += '</select>';
    html += '</div>';

    // To: line — who we're contacting
    html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;margin-bottom:6px;font-size:12px;">';
    html += '<span style="color:var(--sw-mid);font-weight:600;">To:</span>';
    html += '<span style="color:var(--sw-dark);font-weight:600;">' + escapeHtml(j.client_name || '') + '</span>';
    html += '<span id="commsToDetail" style="color:var(--sw-mid);">' + (j.client_phone || '') + '</span>';
    html += '</div>';

    html += '<div class="comms-mode-tabs">';
    html += '<button class="comms-mode-tab active" onclick="setCommsMode(\'sms\')">SMS</button>';
    html += '<button class="comms-mode-tab" onclick="setCommsMode(\'email\')">Email</button>';
    html += '</div>';

    // Templates
    html += '<div class="comms-templates">';
    html += '<button class="comms-template-btn" onclick="applyCommsTemplate(\'scheduled\')">Scheduled</button>';
    html += '<button class="comms-template-btn" onclick="applyCommsTemplate(\'materials\')">Materials</button>';
    html += '<button class="comms-template-btn" onclick="applyCommsTemplate(\'complete\')">Complete</button>';
    html += '<button class="comms-template-btn" onclick="applyCommsTemplate(\'payment\')">Payment</button>';
    html += '<button class="comms-template-btn" onclick="applyCommsTemplate(\'follow_up\')">Follow Up</button>';
    html += '</div>';

    // SMS compose
    html += '<div id="commsCompSMS">';
    html += '<textarea id="commsSMSText" class="form-textarea" style="width:100%;min-height:60px;resize:vertical;" placeholder="Type your SMS message..." oninput="updateCommsCharCount()"></textarea>';
    html += '<div class="comms-char-count"><span id="commsCharCount">0</span>/160</div>';
    html += '</div>';

    // Email compose (hidden by default)
    html += '<div id="commsCompEmail" style="display:none;">';
    html += '<input type="email" class="form-input" id="commsEmailTo" value="' + escapeHtml(j.client_email || '') + '" placeholder="Recipient email" style="margin-bottom:6px;">';
    html += '<input type="text" class="form-input" id="commsEmailSubject" placeholder="Subject" style="margin-bottom:6px;">';
    html += '<textarea id="commsEmailBody" class="form-textarea" style="width:100%;min-height:80px;resize:vertical;" placeholder="Email body..."></textarea>';
    html += '</div>';

    html += '<div class="comms-send-row">';
    html += '<button class="comms-send-btn" onclick="sendCommsMessage()">Send</button>';
    html += '</div>';
    html += '</div>';
  }
  // ── Automated Communications Timeline ──
  html += '<div id="commsAutoSection" style="margin-top:16px;border-top:2px solid var(--sw-border);padding-top:12px;">';
  html += '<div style="font-size:13px;font-weight:700;color:var(--sw-dark);margin-bottom:8px;">Automated Communications</div>';
  html += '<div id="commsAutoTimeline"><div class="loading" style="text-align:center;padding:12px;font-size:12px;color:var(--sw-text-sec);">Loading...</div></div>';
  html += '</div>';

  html += '</div>'; // end commsClientView

  // ── Supplier View ──
  html += '<div id="commsSupplierView" style="display:none;">';
  if (pos.length === 0) {
    html += '<div class="comms-empty">No purchase orders for this job yet.</div>';
  } else {
    var supplierGroups = {};
    pos.forEach(function(po) {
      var sn = po.supplier_name || 'Unknown';
      if (!supplierGroups[sn]) supplierGroups[sn] = [];
      supplierGroups[sn].push(po);
    });
    Object.keys(supplierGroups).forEach(function(sn) {
      var spos = supplierGroups[sn];
      var supplierEmail = '';
      var sup = _suppliers.find(function(s) { return s.name === sn; });
      if (sup) supplierEmail = sup.email || '';
      var groupId = 'supplierGroup_' + sn.replace(/[^a-zA-Z0-9]/g, '_');
      html += '<div class="supplier-thread-group" id="' + groupId + '">';
      html += '<div class="supplier-thread-header" onclick="this.parentElement.classList.toggle(\'expanded\')">';
      html += '<div><strong>' + escapeHtml(sn) + '</strong>';
      if (supplierEmail) html += ' <span style="font-size:11px;color:var(--sw-text-sec);">' + escapeHtml(supplierEmail) + '</span>';
      html += '<div style="font-size:11px;color:var(--sw-text-sec);">' + spos.map(function(p) { return p.po_number; }).join(', ') + '</div>';
      html += '</div>';
      html += '<span style="font-size:11px;color:var(--sw-text-sec);">' + spos.length + ' PO' + (spos.length > 1 ? 's' : '') + '</span>';
      html += '</div>';
      html += '<div class="supplier-thread-body">';
      spos.forEach(function(po) {
        html += '<div style="padding:6px 0;border-bottom:1px solid var(--sw-border);font-size:12px;display:flex;align-items:center;gap:8px;">';
        html += '<div style="flex:1;"><strong>' + (po.po_number || '') + '</strong> <span class="status-badge ' + (po.status || '') + '">' + (po.status || '') + '</span> ' + fmt$(po.total) + '</div>';
        html += '<button onclick="openPOEmailCompose(\'' + po.id + '\')" style="font-size:10px;padding:3px 8px;border:1px solid var(--sw-border);border-radius:3px;background:var(--sw-card);cursor:pointer;color:var(--sw-text-sec);white-space:nowrap;">&#9993; Email</button>';
        html += '</div>';
        html += '<div class="po-email-thread" id="poThreadComms_' + po.id + '"></div>';
      });
      html += '</div>';
      html += '</div>';
    });
  }
  html += '</div>'; // end commsSupplierView

  // ── Email Log View ──
  html += '<div id="commsEmailView" style="display:none;">';
  html += '<div id="emailLogContent"><div class="loading" style="text-align:center;padding:20px;">Loading email log...</div></div>';
  html += '</div>';

  container.innerHTML = html;

  // Load client conversation async
  if (j.ghl_contact_id) {
    loadConversation(j.ghl_contact_id);
  }

  // Load automated comms timeline
  loadAutoCommsTimeline(j.id);

  // Load supplier email threads
  if (pos.length > 0) {
    pos.forEach(function(po) {
      loadPOEmails(po.id).then(function(emails) {
        var threadEl = document.getElementById('poThreadComms_' + po.id);
        if (threadEl && emails.length > 0) {
          threadEl.innerHTML = renderPOEmailThread(emails, po.id);
          threadEl.style.display = 'block';
        }
      });
    });
  }
}

function setCommsChannel(channel) {
  var clientView = document.getElementById('commsClientView');
  var supplierView = document.getElementById('commsSupplierView');
  var emailView = document.getElementById('commsEmailView');
  var clientTab = document.getElementById('commsTabClient');
  var supplierTab = document.getElementById('commsTabSuppliers');
  var emailTab = document.getElementById('commsTabEmail');
  if (!clientView || !supplierView) return;

  // Hide all
  clientView.style.display = 'none';
  supplierView.style.display = 'none';
  if (emailView) emailView.style.display = 'none';
  clientTab.classList.remove('active');
  supplierTab.classList.remove('active');
  if (emailTab) emailTab.classList.remove('active');

  if (channel === 'suppliers') {
    supplierView.style.display = 'block';
    supplierTab.classList.add('active');
  } else if (channel === 'email') {
    if (emailView) emailView.style.display = 'block';
    if (emailTab) emailTab.classList.add('active');
    loadEmailLog();
  } else {
    clientView.style.display = 'block';
    clientTab.classList.add('active');
  }
}

// ── Email Log: fetch + render ──
var _emailLogLoaded = false;
async function loadEmailLog() {
  if (_emailLogLoaded) return;
  var container = document.getElementById('emailLogContent');
  if (!container || !_currentJobId) return;

  try {
    var res = await fetch(OPS_API + '?action=get_email_events&job_id=' + _currentJobId);
    var events = await res.json();
    _emailLogLoaded = false; // allow refresh on next open
    if (!events || events.length === 0) {
      container.innerHTML = '<div class="comms-empty">No emails logged for this job yet.</div>';
      return;
    }
    _emailLogLoaded = true;
    container.innerHTML = renderEmailLog(events);
  } catch (e) {
    container.innerHTML = '<div class="comms-empty">Failed to load email log.</div>';
  }
}

function renderEmailLog(events) {
  var html = '';

  // Group by type
  var groups = { quote: [], invoice: [], reminder: [], other: [] };
  events.forEach(function(ev) {
    var t = ev.email_type || 'other';
    if (groups[t]) groups[t].push(ev);
    else groups.other.push(ev);
  });

  var groupOrder = [
    { key: 'invoice', icon: '\uD83C\uDFE2', label: 'Invoice Emails' },
    { key: 'quote', icon: '\uD83D\uDC64', label: 'Quote Emails' },
    { key: 'reminder', icon: '\u23F0', label: 'Reminders' },
    { key: 'other', icon: '\uD83D\uDCE7', label: 'Other' }
  ];

  groupOrder.forEach(function(g) {
    var items = groups[g.key];
    if (!items || items.length === 0) return;

    html += '<div style="margin-bottom:16px;">';
    html += '<div style="font-size:12px;font-weight:600;color:var(--sw-mid);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">' + g.icon + ' ' + g.label + ' (' + items.length + ')</div>';

    items.forEach(function(ev) {
      var statusColor = ev.status === 'sent' ? 'var(--sw-orange)' : ev.status === 'delivered' ? '#34C759' : ev.status === 'opened' ? '#007AFF' : ev.status === 'failed' ? '#FF3B30' : ev.status === 'bounced' ? '#FF3B30' : 'var(--sw-text-sec)';
      var statusLabel = (ev.status || 'unknown').charAt(0).toUpperCase() + (ev.status || 'unknown').slice(1);

      // Buying signal: opened multiple times
      var openBadge = '';
      var meta = ev.metadata || {};
      if (ev.status === 'opened' && meta.open_count && meta.open_count > 2) {
        openBadge = ' <span style="background:var(--sw-orange);color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;font-weight:600;">Opened ' + meta.open_count + 'x</span>';
      }

      // Bounce warning
      var bounceBadge = '';
      if (ev.status === 'bounced') {
        bounceBadge = ' <span style="background:#FF3B30;color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;font-weight:600;">Bounced</span>';
      }

      var dateStr = ev.sent_at ? new Date(ev.sent_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : (ev.created_at ? new Date(ev.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

      html += '<div style="padding:8px 10px;margin-bottom:4px;background:var(--sw-light);border-radius:6px;font-size:12px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      html += '<div style="font-weight:600;color:var(--sw-dark);">' + escapeHtml(ev.subject || 'No subject') + '</div>';
      html += '<span style="color:' + statusColor + ';font-size:11px;font-weight:600;">' + statusLabel + '</span>';
      html += '</div>';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;color:var(--sw-text-sec);font-size:11px;">';
      html += '<span>To: ' + escapeHtml(ev.recipient || '') + '</span>';
      html += '<span>' + dateStr + '</span>';
      html += '</div>';
      if (openBadge || bounceBadge) {
        html += '<div style="margin-top:4px;">' + openBadge + bounceBadge + '</div>';
      }
      if (ev.failure_reason) {
        html += '<div style="margin-top:4px;color:#FF3B30;font-size:11px;">Error: ' + escapeHtml(ev.failure_reason) + '</div>';
      }
      html += '</div>';
    });

    html += '</div>';
  });

  return html;
}

async function loadConversation(contactId) {
  var cacheKey = 'sw_convo_' + contactId;
  var cached = sessionStorage.getItem(cacheKey);

  if (cached) {
    try {
      var cachedData = JSON.parse(cached);
      renderMessageThread(cachedData.messages, cachedData.conversationId);
      return;
    } catch (e) {}
  }

  try {
    var resp = await fetch(_commsGHLBase + '?action=get_conversation&contactId=' + contactId, { headers: { 'x-api-key': _swApiKey } });
    var data = await resp.json();

    if (data.error) throw new Error(data.error);

    // Cache for session
    sessionStorage.setItem(cacheKey, JSON.stringify(data));
    renderMessageThread(data.messages || [], data.conversationId);
  } catch (e) {
    var thread = document.getElementById('commsThread');
    if (thread) {
      var j = _currentJobData?.job;
      var ghlLink = j?.ghl_contact_id ? 'https://app.maxlead.com.au/v2/location/' + GHL_LOCATION_ID + '/contacts/' + j.ghl_contact_id : '#';
      thread.innerHTML = '<div class="comms-empty">Conversation failed to load.<br><a href="' + ghlLink + '" target="_blank" style="color:var(--sw-orange);">View in GHL &#8599;</a></div>';
    }
  }
}

function renderMessageThread(messages, conversationId) {
  var thread = document.getElementById('commsThread');
  if (!thread) return;

  if (!messages || messages.length === 0) {
    thread.innerHTML = '<div class="comms-empty">No messages yet. Send the first one below.</div>';
    return;
  }

  // Sort chronologically (oldest first)
  messages.sort(function(a, b) { return (a.timestamp || '') < (b.timestamp || '') ? -1 : 1; });

  var html = '';
  messages.forEach(function(msg) {
    var ts = msg.timestamp ? new Date(msg.timestamp) : null;
    var timeStr = ts ? ts.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' ' + ts.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '';
    var type = (msg.type || 'SMS').toUpperCase().replace('TYPE_', '');

    // Call logs
    if (type === 'CALL' || type === 'VOICEMAIL') {
      var durMin = msg.duration ? Math.round(msg.duration / 60) : 0;
      html += '<div class="comms-msg call-log">&#9742; Phone call' + (durMin > 0 ? ' — ' + durMin + ' min' : '') + ' — ' + timeStr + '</div>';
      return;
    }

    var dir = msg.direction === 'outbound' ? 'outbound' : 'inbound';
    var isEmail = type === 'EMAIL';

    html += '<div class="comms-msg ' + dir + (isEmail ? ' email' : '') + '">';
    if (isEmail && msg.subject) {
      html += '<div class="comms-msg-subject">&#9993; ' + escapeHtml(msg.subject || '') + '</div>';
    }
    html += '<div>' + escapeHtml(msg.body || '') + '</div>';
    html += '<div class="comms-msg-meta">' + timeStr;
    if (dir === 'outbound' && msg.sender_name) html += ' &middot; ' + escapeHtml(msg.sender_name);
    if (isEmail) html += ' &middot; Email';
    html += '</div>';
    html += '</div>';
  });

  thread.innerHTML = html;
  // Auto-scroll to bottom
  thread.scrollTop = thread.scrollHeight;
}

function setCommsMode(mode) {
  _commsMode = mode;
  document.querySelectorAll('.comms-mode-tab').forEach(function(b) {
    b.classList.toggle('active', b.textContent.toLowerCase() === mode);
  });
  document.getElementById('commsCompSMS').style.display = mode === 'sms' ? 'block' : 'none';
  document.getElementById('commsCompEmail').style.display = mode === 'email' ? 'block' : 'none';

  // Update To: line for SMS vs Email
  var j = _currentJobData ? _currentJobData.job : {};
  var toDetail = document.getElementById('commsToDetail');
  if (toDetail) toDetail.textContent = mode === 'sms' ? (j.client_phone || '') : (j.client_email || 'No email on file');
}

function updateCommsCharCount() {
  var text = document.getElementById('commsSMSText').value;
  var count = document.getElementById('commsCharCount');
  count.textContent = text.length;
  count.style.color = text.length > 160 ? 'var(--sw-red)' : 'var(--sw-text-sec)';
}

function applyCommsTemplate(key) {
  var tmpl = COMMS_TEMPLATES[key];
  if (!tmpl) return;
  var j = _currentJobData?.job;
  if (!j) return;

  var firstName = (j.client_name || '').split(' ')[0] || 'there';
  var text = tmpl
    .replace(/\{firstName\}/g, firstName)
    .replace(/\{jobNumber\}/g, j.job_number || '')
    .replace(/\{address\}/g, j.site_address || j.site_suburb || '')
    .replace(/\{jobType\}/g, j.type || 'patio')
    .replace(/\{date\}/g, j.scheduled_at ? fmtDate(j.scheduled_at) : '[date]')
    .replace(/\{invoiceNumber\}/g, '[invoice #]');

  if (_commsMode === 'sms') {
    document.getElementById('commsSMSText').value = text;
    updateCommsCharCount();
  } else {
    document.getElementById('commsEmailBody').value = text;
    document.getElementById('commsEmailSubject').value = key === 'payment' ? 'Payment Reminder' : key === 'complete' ? 'Project Complete' : 'Update from SecureWorks WA';
  }
}

async function sendCommsMessage() {
  var j = _currentJobData?.job;
  if (!j || !j.ghl_contact_id) { showToast('No GHL contact linked', 'warning'); return; }

  if (_commsMode === 'sms') {
    var text = document.getElementById('commsSMSText').value.trim();
    if (!text) { showToast('Message is empty', 'warning'); return; }

    // Optimistic UI: show message immediately
    addOptimisticMessage(text, 'SMS');
    document.getElementById('commsSMSText').value = '';
    updateCommsCharCount();

    try {
      await fetch(_commsGHLBase + '?action=send_sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': _swApiKey },
        body: JSON.stringify({
          contactId: j.ghl_contact_id,
          message: text,
          jobId: j.id,
        }),
      }).then(function(r) { return r.json(); }).then(function(data) {
        if (!data.success) throw new Error(data.error || 'Send failed');
      });
      // Clear cache so next load gets fresh data
      sessionStorage.removeItem('sw_convo_' + j.ghl_contact_id);
    } catch (e) {
      showToast('SMS failed: ' + e.message + ' — retry?', 'warning');
    }
  } else {
    var subject = document.getElementById('commsEmailSubject').value.trim();
    var body = document.getElementById('commsEmailBody').value.trim();
    if (!subject || !body) { showToast('Subject and body required', 'warning'); return; }

    addOptimisticMessage(body, 'EMAIL', subject);
    document.getElementById('commsEmailSubject').value = '';
    document.getElementById('commsEmailBody').value = '';

    try {
      await fetch(_commsGHLBase + '?action=send_email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': _swApiKey },
        body: JSON.stringify({
          contactId: j.ghl_contact_id,
          subject: subject,
          htmlBody: '<p>' + body.replace(/\n/g, '<br>') + '</p>',
        }),
      }).then(function(r) { return r.json(); }).then(function(data) {
        if (!data.success) throw new Error(data.error || 'Send failed');
      });
      sessionStorage.removeItem('sw_convo_' + j.ghl_contact_id);
    } catch (e) {
      showToast('Email failed: ' + e.message, 'warning');
    }
  }
}

function addOptimisticMessage(body, type, subject) {
  var thread = document.getElementById('commsThread');
  if (!thread) return;
  var now = new Date();
  var timeStr = now.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' ' + now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  var isEmail = type === 'EMAIL';
  var div = document.createElement('div');
  div.className = 'comms-msg outbound' + (isEmail ? ' email' : '');
  div.style.opacity = '0.7';
  var html = '';
  if (isEmail && subject) html += '<div class="comms-msg-subject">&#9993; ' + escapeHtml(subject) + '</div>';
  html += '<div>' + escapeHtml(body) + '</div>';
  html += '<div class="comms-msg-meta">' + timeStr + ' &middot; Sending...</div>';
  div.innerHTML = html;
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
  // Confirm after 2s
  setTimeout(function() { div.style.opacity = '1'; var meta = div.querySelector('.comms-msg-meta'); if (meta) meta.textContent = timeStr + ' &middot; Sent'; }, 2000);
}

// ── Call System (Bridge on desktop, tel: on mobile) ──
var _isMobile = ('ontouchstart' in window) || window.innerWidth < 768;

function scheduleCallLog() {
  if (!_currentJobData) return;
  var j = _currentJobData.job;

  if (_isMobile) {
    // Mobile: use tel: link (already navigating) + log on return
    document.addEventListener('visibilitychange', _onCallReturn, { once: true });
  } else {
    // Desktop: show bridge calling modal
    openCallBridgeModal(j);
  }
}

function openCallBridgeModal(j) {
  var userPhone = localStorage.getItem('sw_my_phone') || '';
  var clientPhone = j.client_phone || '';
  var firstName = (j.client_name || '').split(' ')[0] || 'client';

  var html = '<div class="modal-title">Call ' + escapeHtml(j.client_name || 'Client') + '</div>';
  html += '<div style="margin-bottom:12px;font-size:13px;color:var(--sw-text-sec);">You\'ll receive a call on your phone that connects you to the client.</div>';
  html += '<div class="form-group"><label class="form-label">Client Number</label><input type="text" class="form-input" value="' + escapeHtml(clientPhone) + '" readonly style="background:var(--sw-light);"></div>';
  html += '<div class="form-group"><label class="form-label">Your Phone Number</label><input type="tel" class="form-input" id="callBridgeUserPhone" value="' + escapeHtml(userPhone) + '" placeholder="04XX XXX XXX"></div>';
  html += '<div style="font-size:10px;color:var(--sw-text-sec);margin-bottom:12px;"><a href="#" onclick="event.preventDefault();document.getElementById(\'callSettingsRow\').style.display=\'block\';">Settings</a></div>';
  html += '<div id="callSettingsRow" style="display:none;margin-bottom:12px;"><label class="form-label">Save as my default number</label><button class="btn btn-secondary btn-sm" onclick="localStorage.setItem(\'sw_my_phone\',document.getElementById(\'callBridgeUserPhone\').value);showToast(\'Saved\',\'success\');">Save</button></div>';
  html += '<div id="callBridgeStatus" style="display:none;text-align:center;padding:16px;font-size:13px;color:var(--sw-mid);"></div>';
  html += '<div class="modal-actions" id="callBridgeActions">';
  html += '<button class="btn btn-secondary" onclick="closeModal(\'callBridgeModal\')">Cancel</button>';

  // If bridge calling isn't available yet, offer fallback
  html += '<button class="btn btn-cta" onclick="startBridgeCall()" style="background:var(--sw-green);border-color:var(--sw-green);">Start Call</button>';
  html += '</div>';

  // Create or update the modal
  var modal = document.getElementById('callBridgeModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'callBridgeModal';
    modal.innerHTML = '<div class="modal" style="max-width:400px;">' + html + '</div>';
    document.body.appendChild(modal);
  } else {
    modal.querySelector('.modal').innerHTML = html;
  }
  modal.classList.add('active');
}

async function startBridgeCall() {
  var j = _currentJobData?.job;
  if (!j) return;
  var userPhone = document.getElementById('callBridgeUserPhone').value.trim();
  if (!userPhone) { showToast('Enter your phone number', 'warning'); return; }

  // Save phone for next time
  localStorage.setItem('sw_my_phone', userPhone);

  var statusEl = document.getElementById('callBridgeStatus');
  var actionsEl = document.getElementById('callBridgeActions');
  statusEl.style.display = 'block';
  statusEl.innerHTML = '<div>Connecting...</div><button class="btn btn-secondary btn-sm" onclick="closeModal(\'callBridgeModal\')" style="margin-top:8px;">Cancel</button>';
  actionsEl.style.display = 'none';

  try {
    var resp = await fetch(_commsGHLBase + '?action=initiate_call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': _swApiKey },
      body: JSON.stringify({
        contactId: j.ghl_contact_id,
        toNumber: j.client_phone,
        userPhone: userPhone,
      }),
    });
    var data = await resp.json();

    if (data.success) {
      statusEl.innerHTML = '<div style="color:var(--sw-green);font-weight:600;">Call connected</div><div style="font-size:11px;margin-top:4px;">Your phone should be ringing...</div>';
      // After a delay, show call notes prompt
      setTimeout(function() {
        closeModal('callBridgeModal');
        promptCallNotes();
      }, 5000);
    } else {
      // Fallback: copy number + tel link
      statusEl.innerHTML = '<div style="color:var(--sw-yellow);">Bridge calling not available yet</div>' +
        '<div style="margin-top:8px;font-size:13px;">Call directly: <a href="tel:' + j.client_phone + '" style="font-weight:600;color:var(--sw-dark);">' + j.client_phone + '</a></div>' +
        '<button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(\'' + j.client_phone + '\');showToast(\'Copied\',\'success\')" style="margin-top:6px;">Copy Number</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="closeModal(\'callBridgeModal\');promptCallNotes()" style="margin-top:6px;">Log Call Notes</button>';
    }
  } catch (e) {
    statusEl.innerHTML = '<div style="color:var(--sw-red);">Connection failed</div>' +
      '<div style="margin-top:8px;font-size:13px;">Call directly: <a href="tel:' + j.client_phone + '">' + j.client_phone + '</a></div>' +
      '<button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(\'' + j.client_phone + '\');showToast(\'Copied\',\'success\')" style="margin-top:6px;">Copy Number</button>';
  }
}

function promptCallNotes() {
  if (!_currentJobData) return;
  var note = prompt('Log call notes? (leave blank to skip)');
  if (note !== null && note.trim()) {
    opsPost('add_note', {
      job_id: _currentJobData.job.id,
      note: 'Phone call: ' + note.trim(),
      event_type: 'call_logged',
    }).then(function() {
      showToast('Call logged', 'success');
      var cid = _currentJobData?.job?.ghl_contact_id;
      if (cid) sessionStorage.removeItem('sw_convo_' + cid);
    }).catch(function() {});
  }
}

function _onCallReturn() {
  if (document.visibilityState !== 'visible') {
    document.addEventListener('visibilitychange', _onCallReturn, { once: true });
    return;
  }
  setTimeout(function() { promptCallNotes(); }, 500);
}

// ════════════════════════════════════════════════════════════
// PO EMAIL LOG
// ════════════════════════════════════════════════════════════

function openPOEmailLog(poId, supplier, jobId) {
  document.getElementById('poEmailPOId').value = poId;
  document.getElementById('poEmailJobId').value = jobId || '';
  document.getElementById('poEmailSupplier').value = supplier || '';
  document.getElementById('poEmailSummary').value = '';
  document.querySelector('input[name="poEmailDir"][value="sent"]').checked = true;
  document.getElementById('poEmailLogModal').classList.add('active');
}

async function submitPOEmailLog() {
  var poId = document.getElementById('poEmailPOId').value;
  var jobId = document.getElementById('poEmailJobId').value;
  var supplier = document.getElementById('poEmailSupplier').value;
  var summary = document.getElementById('poEmailSummary').value.trim();
  var direction = document.querySelector('input[name="poEmailDir"]:checked').value;

  if (!summary) { showToast('Summary is required', 'warning'); return; }

  try {
    await opsPost('add_po_event', {
      po_id: poId,
      job_id: jobId || null,
      event_type: 'po_email_log',
      supplier: supplier,
      summary: summary,
      direction: direction,
    });
    closeModal('poEmailLogModal');
    showToast('Email logged', 'success');
    // Refresh current view if job detail is open
    if (_currentJobId) {
      openJobDetail(_currentJobId);
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'warning');
  }
}

// ════════════════════════════════════════════════════════════
// PO EMAIL COMPOSE + THREAD
// ════════════════════════════════════════════════════════════

var _poEmailCache = {};
var _poComposeData = null; // temp PO data for template replacements

var _poEmailTemplates = {
  new_order: 'Hi {supplier_name},\n\nPlease find attached PO {po_number} for job {site_address}.\n\nDelivery required by: {delivery_date}\n\n{line_items_summary}\n\nPlease confirm receipt and expected delivery date.\n\nThanks,\nSecureWorks WA',
  delivery_change: 'Hi {supplier_name},\n\nRegarding PO {po_number} for job {job_number} — we need to change the delivery details.\n\nNew delivery date: {delivery_date}\nDelivery address: {site_address}\n\nPlease confirm this change.\n\nThanks,\nSecureWorks WA',
  order_query: 'Hi {supplier_name},\n\nJust following up on PO {po_number} for job {job_number}.\n\nCould you please provide an update on the order status and expected delivery?\n\nThanks,\nSecureWorks WA',
  cancellation: 'Hi {supplier_name},\n\nPlease cancel PO {po_number} for job {job_number}.\n\nPlease confirm cancellation at your earliest convenience.\n\nThanks,\nSecureWorks WA',
  custom: ''
};

function openPOEmailCompose(poId) {
  if (!poId) { showToast('No PO selected', 'warning'); return; }

  var po = _allPOs.find(function(p) { return p.id === poId; });
  if (!po) { showToast('PO not found', 'warning'); return; }

  // Find supplier email — prompt to add one if missing
  var supplierEmail = '';
  if (_suppliers && _suppliers.length > 0) {
    var sup = _suppliers.find(function(s) { return s.name === po.supplier_name; });
    if (sup && sup.email) {
      supplierEmail = sup.email;
    } else if (po.supplier_name) {
      var entered = prompt('No email on file for ' + po.supplier_name + '. Enter their email:');
      if (entered && entered.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        supplierEmail = entered;
        // Save it for next time
        opsPost('update_supplier_email', { supplier_name: po.supplier_name, email: entered }).then(function() {
          if (sup) sup.email = entered;
        }).catch(function() {});
      } else if (entered) {
        showToast('Invalid email address', 'warning');
      }
    }
  }

  // Build line items summary for email template
  var lineItemsSummary = '';
  var lineItems = po.line_items || po.items || [];
  if (Array.isArray(lineItems) && lineItems.length > 0) {
    lineItemsSummary = lineItems.map(function(li) {
      var desc = li.description || li.item || '';
      var qty = li.quantity || li.qty || '';
      return qty ? '- ' + desc + ' (x' + qty + ')' : '- ' + desc;
    }).join('\n');
  }

  // Resolve job address from current job data or PO
  var jobAddress = po.delivery_address || '';
  if (!jobAddress && _currentJobData && _currentJobData.job) {
    jobAddress = [_currentJobData.job.site_address, _currentJobData.job.site_suburb].filter(Boolean).join(', ');
  }

  // Store PO data for template replacements
  _poComposeData = {
    po_number: po.po_number || '',
    job_number: po.job_number || '',
    site_address: jobAddress,
    delivery_date: po.delivery_date ? new Date(po.delivery_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'TBC',
    supplier_name: po.supplier_name || '',
    job_id: po.job_id || '',
    po_id: po.id,
    line_items_summary: lineItemsSummary
  };

  document.getElementById('poComposeTitle').textContent = 'Email Supplier \u2014 ' + (po.po_number || 'PO');
  document.getElementById('poComposeTo').value = supplierEmail;
  document.getElementById('poComposeSubject').value = 'PO ' + (po.po_number || '') + ' \u2014 ' + (jobAddress || po.job_number || '') + ' \u2014 SecureWorks WA';
  document.getElementById('poComposePoId').value = po.id;
  document.getElementById('poComposeJobId').value = po.job_id || '';
  document.getElementById('poComposeTemplate').value = 'new_order';
  document.getElementById('poComposeAttachPDF').checked = true;
  document.getElementById('poComposeFiles').value = '';
  document.getElementById('poComposeFileList').textContent = '';

  applyPOEmailTemplate('new_order');
  document.getElementById('poEmailComposeModal').classList.add('active');
}

function applyPOEmailTemplate(templateKey) {
  var body = _poEmailTemplates[templateKey] || '';
  if (_poComposeData && body) {
    Object.keys(_poComposeData).forEach(function(k) {
      body = body.replace(new RegExp('\\{' + k + '\\}', 'g'), _poComposeData[k]);
    });
  }
  document.getElementById('poComposeBody').value = body;

  // Attach PDF checkbox: checked for new_order only
  var attachPDF = document.getElementById('poComposeAttachPDF');
  if (attachPDF) attachPDF.checked = (templateKey === 'new_order');
}

function updatePOComposeFileList() {
  var input = document.getElementById('poComposeFiles');
  var list = document.getElementById('poComposeFileList');
  if (!input || !list) return;
  if (input.files.length === 0) { list.textContent = ''; return; }
  var names = [];
  for (var i = 0; i < input.files.length; i++) names.push(input.files[i].name);
  list.textContent = names.join(', ');
}

async function sendPOEmail() {
  var to = (document.getElementById('poComposeTo').value || '').trim();
  var subject = (document.getElementById('poComposeSubject').value || '').trim();
  var body = (document.getElementById('poComposeBody').value || '').trim();
  var attachPDF = document.getElementById('poComposeAttachPDF').checked;
  var poId = document.getElementById('poComposePoId').value;
  var jobId = document.getElementById('poComposeJobId').value;
  var supplierName = _poComposeData ? _poComposeData.supplier_name : '';

  // Validation
  if (!to) { showToast('Recipient email is required', 'warning'); return; }
  if (!to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { showToast('Invalid email address', 'warning'); return; }
  if (!subject) { showToast('Subject is required', 'warning'); return; }
  if (!body) { showToast('Email body is required', 'warning'); return; }

  // Try to save supplier email if it was manually entered
  if (supplierName && to) {
    var existingSup = _suppliers.find(function(s) { return s.name === supplierName; });
    if (!existingSup || !existingSup.email || existingSup.email !== to) {
      try {
        await opsPost('update_supplier_email', { supplier_name: supplierName, email: to });
        // Update local cache
        if (existingSup) { existingSup.email = to; }
      } catch (e) {
        // Silently fail — endpoint may not exist yet
      }
    }
  }

  // Generate + upload PO PDF if requested
  var pdfUrl = null;
  if (attachPDF && poId) {
    try {
      showToast('Generating PO PDF...', 'info');
      var pdfDataUri = await generatePOPDF(poId);
      if (pdfDataUri) {
        pdfUrl = await uploadPOPDF(poId, pdfDataUri);
        if (pdfUrl) console.log('[PO PDF] Uploaded:', pdfUrl);
      }
    } catch (e) {
      console.log('[PO PDF] Generation failed (non-blocking):', e.message);
    }
  }

  // Try to send via edge function
  try {
    var resp = await fetch(window.SUPABASE_URL + '/functions/v1/send-po-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': _swApiKey },
      body: JSON.stringify({
        po_id: poId,
        to_email: to,
        subject: subject,
        body_text: body,
        body_html: '<pre style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap;">' + body.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</pre>',
        attach_po_pdf: attachPDF,
        pdf_url: pdfUrl
      })
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var result = await resp.json();
    if (result.error) throw new Error(result.error);

    showToast('Email sent to ' + (supplierName || to), 'success');
    closeModal('poEmailComposeModal');

    // Update PO status to 'submitted' (sent)
    try {
      await opsPost('update_po', { id: poId, status: 'submitted' });
    } catch (e3) { /* status update non-critical */ }

    // Log the sent email as an event too
    try {
      await opsPost('add_po_event', {
        po_id: poId,
        job_id: jobId || null,
        event_type: 'po_email_log',
        supplier: supplierName,
        summary: 'Subject: ' + subject + '\n\n' + body,
        direction: 'sent',
      });
    } catch (e2) { /* event logging is secondary */ }

    // Refresh thread if visible
    if (_poEmailCache[poId]) delete _poEmailCache[poId];
    var threadEl = document.getElementById('poThread_' + poId);
    if (threadEl && threadEl.style.display !== 'none') {
      loadPOEmails(poId).then(function(emails) {
        threadEl.innerHTML = renderPOEmailThread(emails, poId);
      });
    }
    if (_currentJobId) openJobDetail(_currentJobId);
    return;
  } catch (e) {
    // Edge function not deployed — fall back to logging
    console.log('send-po-email not available, falling back to log:', e.message);
  }

  // Fallback: log the email
  try {
    await opsPost('add_po_event', {
      po_id: poId,
      job_id: jobId || null,
      event_type: 'po_email_log',
      supplier: supplierName,
      summary: 'Email composed (to: ' + to + ')\nSubject: ' + subject + '\n\n' + body,
      direction: 'sent',
    });
    showToast('Email logged (send-po-email not deployed yet \u2014 email saved as log)', 'warning');
    closeModal('poEmailComposeModal');
    if (_poEmailCache[poId]) delete _poEmailCache[poId];
    if (_currentJobId) openJobDetail(_currentJobId);
  } catch (e) {
    showToast('Error: ' + e.message, 'warning');
  }
}

// ── PO Email Thread Loading & Rendering ──

async function loadPOEmails(poId) {
  if (_poEmailCache[poId]) return _poEmailCache[poId];
  try {
    // Use list_po_communications (new action) with fallback to read_po_emails (legacy)
    var data = await opsFetch('list_po_communications', { po_id: poId });
    var emails = data.emails || data || [];
    if (!Array.isArray(emails)) emails = [];
    _poEmailCache[poId] = emails;
    return emails;
  } catch (e) {
    try {
      var data2 = await opsFetch('read_po_emails', { po_id: poId });
      var emails2 = data2.emails || data2 || [];
      if (!Array.isArray(emails2)) emails2 = [];
      _poEmailCache[poId] = emails2;
      return emails2;
    } catch (e2) {
      _poEmailCache[poId] = [];
      return [];
    }
  }
}

function renderPOEmailThread(emails, poId) {
  if (!emails || emails.length === 0) return '<div style="font-size:11px;color:var(--sw-text-sec);padding:6px 0;">No emails yet.</div>';
  var html = '';
  emails.sort(function(a, b) { return (a.created_at || '') < (b.created_at || '') ? -1 : 1; });
  emails.forEach(function(em, idx) {
    var isInbound = em.direction === 'inbound' || em.direction === 'received';
    var dir = isInbound ? 'received' : 'sent';
    var date = (em.created_at || em.sent_at || em.received_at) ? new Date(em.created_at || em.sent_at || em.received_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    var subj = em.subject || em.summary || '';
    var bodyText = em.body_text || em.body || em.summary || '';
    var firstLine = bodyText.split('\n')[0] || '';
    if (firstLine.length > 100) firstLine = firstLine.substring(0, 100) + '...';

    // Direction arrow + delivery status
    var arrow = isInbound ? '<span style="color:var(--sw-blue, #3498DB)">&#8601;</span>' : '<span style="color:var(--sw-orange)">&#8599;</span>';
    var statusBadge = '';
    var ds = em.delivery_status || '';
    if (!isInbound && ds) {
      var badgeColor = ds === 'opened' ? 'var(--sw-green)' : ds === 'delivered' ? 'var(--sw-blue, #3498DB)' : ds === 'bounced' ? 'var(--sw-red)' : '#999';
      statusBadge = '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:' + badgeColor + '20;color:' + badgeColor + ';font-weight:600;margin-left:6px">' + escapeHtml(ds) + '</span>';
    }

    // Unread indicator
    var unreadDot = (isInbound && !em.read_at) ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--sw-blue, #3498DB);margin-right:4px" title="Unread"></span>' : '';

    // Auto-mark as read when rendered
    if (isInbound && !em.read_at && em.id) {
      opsPost('mark_email_read', { email_id: em.id }).catch(function() {});
      em.read_at = new Date().toISOString(); // prevent re-marking
    }

    var bgColor = isInbound ? 'rgba(52,152,219,0.04)' : 'rgba(241,90,41,0.04)';
    var borderLeft = isInbound ? '3px solid var(--sw-blue, #3498DB)' : '3px solid var(--sw-orange)';

    html += '<div class="po-email-item ' + dir + '" style="padding:10px 12px;margin-bottom:6px;border-left:' + borderLeft + ';background:' + bgColor + ';border-radius:0 6px 6px 0;cursor:pointer" onclick="this.classList.toggle(\'expanded\')" data-idx="' + idx + '">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--sw-text-sec)">';
    html += '<span>' + unreadDot + arrow + ' ' + (isInbound ? 'From: ' + escapeHtml(em.from_email || '') : 'To: ' + escapeHtml(em.to_email || '')) + '</span>';
    html += '<span>' + date + statusBadge + '</span>';
    html += '</div>';
    if (subj) html += '<div style="font-weight:600;font-size:12px;margin-top:3px">' + escapeHtml(subj.length > 70 ? subj.substring(0, 70) + '...' : subj) + '</div>';
    html += '<div class="po-email-preview" style="font-size:11px;color:var(--sw-text-sec);margin-top:2px">' + escapeHtml(firstLine) + '</div>';
    html += '<div class="po-email-body" style="display:none;font-size:12px;margin-top:8px;white-space:pre-wrap;line-height:1.5">' + escapeHtml(bodyText) + '</div>';

    // Attachments
    var atts = em.attachments_json || em.attachments || [];
    if (Array.isArray(atts) && atts.length > 0) {
      html += '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">';
      atts.forEach(function(att) {
        var name = att.filename || att.name || 'Document';
        var url = att.storage_url || att.url || '';
        html += '<a href="' + escapeHtml(url) + '" target="_blank" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:var(--sw-light);border-radius:4px;font-size:10px;color:var(--sw-mid);text-decoration:none;font-weight:600">';
        html += '&#128206; ' + escapeHtml(name) + '</a>';
      });
      html += '</div>';
    }

    if (isInbound) {
      html += '<button class="po-email-reply-btn" style="display:none;margin-top:6px;padding:4px 10px;background:var(--sw-dark);color:#fff;border:none;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer" onclick="event.stopPropagation();openPOEmailComposeReply(\'' + poId + '\',\'' + escapeHtml(subj).replace(/'/g, "\\'") + '\')">Reply</button>';
    }
    html += '</div>';
  });
  return html;
}

function openPOEmailComposeReply(poId, originalSubject) {
  openPOEmailCompose(poId);
  // After opening, set subject to Re: ...
  setTimeout(function() {
    var subjectEl = document.getElementById('poComposeSubject');
    if (subjectEl && originalSubject) {
      var reSubject = originalSubject.indexOf('Re:') === 0 ? originalSubject : 'Re: ' + originalSubject;
      subjectEl.value = reSubject;
    }
    document.getElementById('poComposeTemplate').value = 'custom';
    document.getElementById('poComposeBody').value = '';
    document.getElementById('poComposeAttachPDF').checked = false;
  }, 50);
}

function togglePOEmailThread(poId, toggleEl) {
  var threadEl = document.getElementById('poThread_' + poId);
  if (!threadEl) return;

  if (threadEl.style.display === 'none') {
    threadEl.style.display = 'block';
    threadEl.innerHTML = '<div style="font-size:11px;color:var(--sw-text-sec);padding:4px 0;">Loading...</div>';
    loadPOEmails(poId).then(function(emails) {
      threadEl.innerHTML = renderPOEmailThread(emails, poId);
      // Update count
      var countEl = document.getElementById('poEmailCount_' + poId);
      if (countEl) countEl.textContent = '(' + emails.length + ')';
    });
  } else {
    threadEl.style.display = 'none';
  }
}

// ── Automated Communications Timeline ──

var COMMS_TRIGGER_LABELS = {
  quote_sent: 'Quote sent',
  quote_accepted: 'Quote accepted',
  deposit_paid: 'Deposit paid',
  materials_ordered: 'Materials ordered',
  council_submitted: 'Council submitted',
  council_approved: 'Council approved',
  crew_scheduled: 'Crew scheduled',
  crew_arriving: 'Crew arriving',
  daily_progress: 'Daily progress',
  job_complete: 'Job complete',
  invoice_sent: 'Invoice sent',
  payment_received: 'Payment received',
  follow_up_30d: '30-day follow-up',
};

var COMMS_STATUS_ICONS = {
  sent: { icon: '&#10003;', color: 'var(--sw-mid)', label: 'Sent' },
  delivered: { icon: '&#10003;&#10003;', color: 'var(--sw-green)', label: 'Delivered' },
  opened: { icon: '&#128065;', color: 'var(--sw-green)', label: 'Opened' },
  bounced: { icon: '&#10007;', color: 'var(--sw-red)', label: 'Bounced' },
  failed: { icon: '&#10007;', color: 'var(--sw-red)', label: 'Failed' },
};

async function loadAutoCommsTimeline(jobId) {
  var el = document.getElementById('commsAutoTimeline');
  if (!el) return;
  try {
    var resp = await opsFetch('list_email_events', { job_id: jobId, limit: 50 });
    var events = resp.events || resp.email_events || resp || [];
    if (!Array.isArray(events)) events = [];
    if (events.length === 0) {
      el.innerHTML = '<div style="font-size:12px;color:var(--sw-text-sec);padding:8px 0;font-style:italic;">No automated communications sent yet.</div>';
      return;
    }
    // Sort by created_at
    events.sort(function(a, b) { return new Date(a.created_at) - new Date(b.created_at); });
    var html = '';
    events.forEach(function(ev) {
      var trigger = ev.comms_trigger || ev.event_type || '';
      var label = COMMS_TRIGGER_LABELS[trigger] || trigger.replace(/_/g, ' ');
      var channel = ev.comms_channel || ev.channel || 'email';
      var channelBadge = channel === 'sms' ? '<span style="background:#e3f2fd;color:#1565c0;padding:1px 5px;border-radius:2px;font-size:10px;font-weight:600;">SMS</span>' :
                         '<span style="background:#fce4ec;color:#c62828;padding:1px 5px;border-radius:2px;font-size:10px;font-weight:600;">Email</span>';
      var status = ev.status || ev.delivery_status || 'sent';
      var statusInfo = COMMS_STATUS_ICONS[status] || COMMS_STATUS_ICONS.sent;
      var openCount = ev.open_count || ev.metadata?.open_count || 0;
      var openText = openCount > 0 ? ' &middot; Opened ' + openCount + ' time' + (openCount > 1 ? 's' : '') : '';
      var date = ev.created_at ? fmtDate(ev.created_at) : '';

      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--sw-border);font-size:12px;">';
      html += '<span style="color:' + statusInfo.color + ';font-size:14px;min-width:18px;">' + statusInfo.icon + '</span>';
      html += '<span style="min-width:60px;color:var(--sw-text-sec);font-size:11px;">' + date + '</span>';
      html += '<span style="flex:1;font-weight:600;color:var(--sw-dark);">' + escapeHtml(label) + '</span>';
      html += channelBadge;
      html += '<span style="font-size:11px;color:' + statusInfo.color + ';">' + statusInfo.label + openText + '</span>';
      html += '</div>';
    });
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div style="font-size:11px;color:var(--sw-text-sec);padding:8px 0;">Could not load automated comms.</div>';
  }
}

// ══════════════════════════════════════════════════════
// EMAIL INBOX — aggregated view of all supplier + council emails
// ══════════════════════════════════════════════════════

window.loadEmailInbox = async function(filter, btnEl) {
  // Update active chip
  if (btnEl) {
    var chips = btnEl.parentElement.querySelectorAll('.inbox-chip');
    chips.forEach(function(c) { c.classList.remove('active'); });
    btnEl.classList.add('active');
  }

  var el = document.getElementById('emailInboxList');
  if (!el) return;
  el.innerHTML = '<div style="font-size:13px;color:var(--sw-text-sec);padding:12px;">Loading...</div>';

  try {
    var params = { limit: '30' };
    if (filter === 'unread') params.unread_only = 'true';
    if (filter === 'po') params.type = 'po';
    if (filter === 'council') params.type = 'council';

    var data = await opsFetch('get_inbox', params);
    var emails = data.emails || [];
    var unreadCount = data.unread_count || 0;

    // Update badges
    var badge = document.getElementById('emailUnreadCount');
    if (badge) badge.textContent = unreadCount > 0 ? '(' + unreadCount + ' unread)' : '';
    var navBadge = document.getElementById('inboxBadge');
    if (navBadge && unreadCount > 0) { navBadge.textContent = unreadCount; navBadge.style.display = ''; }
    var navBadgeMobile = document.getElementById('inboxBadgeMobile');
    if (navBadgeMobile && unreadCount > 0) { navBadgeMobile.textContent = unreadCount; navBadgeMobile.style.display = ''; }

    if (emails.length === 0) {
      el.innerHTML = '<div style="font-size:13px;color:var(--sw-text-sec);padding:20px;text-align:center;">No emails found.</div>';
      return;
    }

    var html = '';
    var currentDay = '';
    emails.forEach(function(em) {
      var dateStr = (em.created_at || '').slice(0, 10);
      var dayLabel = dateStr === new Date().toISOString().slice(0, 10) ? 'Today' : (dateStr === new Date(Date.now() - 86400000).toISOString().slice(0, 10) ? 'Yesterday' : dateStr);
      if (dayLabel !== currentDay) {
        currentDay = dayLabel;
        html += '<div style="font-size:11px;font-weight:700;color:var(--sw-text-sec);text-transform:uppercase;padding:8px 0 4px;border-bottom:1px solid var(--sw-border);margin-top:8px">' + dayLabel + '</div>';
      }

      var isInbound = em.direction === 'inbound' || em.direction === 'received';
      var isUnread = isInbound && !em.read_at;
      var arrow = isInbound ? '<span style="color:var(--sw-blue, #3498DB)">&#8601;</span>' : '<span style="color:var(--sw-orange)">&#8599;</span>';
      var dot = isUnread ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--sw-blue, #3498DB);margin-right:4px"></span>' : '';
      var time = em.created_at ? new Date(em.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '';
      var who = isInbound ? (em.from_email || '').split('@')[0] : 'You';
      var jobNum = em.jobs ? em.jobs.job_number : '';
      var subj = em.subject || '';
      var preview = (em.body_text || '').split('\n')[0] || '';
      if (preview.length > 80) preview = preview.substring(0, 80) + '...';

      var jobId = em.job_id || '';
      html += '<div style="display:flex;gap:8px;padding:10px 0;border-bottom:1px solid var(--sw-border);cursor:pointer;' + (isUnread ? 'font-weight:600;' : '') + '" onclick="openJobDetailAndFocus(\'' + jobId + '\',\'' + (em.po_id || '') + '\')">';
      html += '<div style="flex:1;min-width:0">';
      html += '<div style="display:flex;justify-content:space-between;font-size:12px">';
      html += '<span>' + dot + arrow + ' ' + escapeHtml(who) + (jobNum ? ' — ' + escapeHtml(jobNum) : '') + '</span>';
      html += '<span style="color:var(--sw-text-sec);font-size:11px">' + time + '</span>';
      html += '</div>';
      html += '<div style="font-size:12px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(subj) + '</div>';
      html += '<div style="font-size:11px;color:var(--sw-text-sec);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(preview) + '</div>';
      html += '</div>';
      html += '</div>';
    });

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div style="font-size:13px;color:var(--sw-red);padding:12px;">Error loading emails: ' + (e.message || e) + '</div>';
  }
};

// Navigate to job detail and focus on the PO/email
window.openJobDetailAndFocus = function(jobId, poId) {
  if (!jobId) return;
  // Use the existing job detail navigation
  if (typeof openJobDetail === 'function') {
    openJobDetail(jobId);
    // After load, switch to money tab (where PO threads live)
    setTimeout(function() {
      if (typeof switchJobTab === 'function') switchJobTab('money');
    }, 500);
  }
};

