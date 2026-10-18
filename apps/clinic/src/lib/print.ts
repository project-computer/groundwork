import type { Appointment, ClinicSettings, MedicalRecord, Patient } from "./types";

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (n: number, currency: string) =>
  `${currency} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function clinicHeader(s: ClinicSettings, title: string) {
  return `
    <div class="clinic">
      <h1>${esc(s.name)}</h1>
      ${s.address ? `<p>${esc(s.address).replace(/\n/g, "<br/>")}</p>` : ""}
      ${(s.phone || s.email) ? `<p>${[s.phone, s.email].filter(Boolean).map(esc).join(" · ")}</p>` : ""}
      ${s.license ? `<p>License: ${esc(s.license)}</p>` : ""}
      <h2>${esc(title)}</h2>
    </div>`;
}

function patientLine(record: MedicalRecord, patient: Patient | undefined) {
  const bits = [
    patient ? `${esc(patient.name)} (${esc(patient.species)}${patient.breed ? `, ${esc(patient.breed)}` : ""})` : "",
    patient?.ownerName ? `Owner: ${esc(patient.ownerName)}` : "",
    `Date: ${esc(record.date ? record.date.replace("T", " ") : record.createdAt)}`,
    record.vet ? `Vet: ${esc(record.vet)}` : "",
    patient?.weightKg ? `Weight: ${esc(patient.weightKg)} kg` : "",
  ].filter(Boolean);
  return `<p class="patient">${bits.join(" · ")}</p>`;
}

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif; color: #111; margin: 24px; font-size: 13px; }
  h1 { font-size: 18px; margin: 0; }
  h2 { font-size: 15px; margin: 12px 0 4px; text-transform: uppercase; letter-spacing: 0.08em; }
  .clinic { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; text-align: center; }
  .clinic p { margin: 2px 0; font-size: 12px; color: #333; }
  .patient { margin: 8px 0 12px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-size: 12px; }
  .totals { margin-top: 8px; text-align: right; }
  .totals p { margin: 2px 0; }
  .grand { font-weight: 700; font-size: 15px; }
  .sig { margin-top: 40px; display: flex; justify-content: space-between; }
  .sig div { border-top: 1px solid #111; padding-top: 4px; width: 40%; font-size: 12px; }
  .next { margin-top: 16px; border: 1px dashed #555; padding: 8px 10px; }
  .note { font-size: 12px; color: #333; }
  @media print { @page { margin: 14mm; } }
`;

function printHtml(inner: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>${PRINT_CSS}</style></head><body>${inner}</body></html>`);
  doc.close();
  const run = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 60_000);
  };
  if (doc.readyState === "complete") setTimeout(run, 50);
  else iframe.onload = run;
}

export function printPrescription(record: MedicalRecord, patient: Patient | undefined, settings: ClinicSettings) {
  if (record.prescriptions.length === 0) return false;
  const rows = record.prescriptions
    .map(
      (p) => `
      <tr>
        <td><strong>${esc(p.drug)}</strong>${p.strength ? ` ${esc(p.strength)}` : ""}</td>
        <td>${esc(p.dose)}</td>
        <td>${esc(p.route)}</td>
        <td>${esc(p.frequency)}${p.durationDays ? ` for ${esc(p.durationDays)} days` : ""}</td>
        <td>${esc(p.quantity)}</td>
      </tr>
      ${p.instructions ? `<tr><td colspan="5" class="note">${esc(p.instructions)}</td></tr>` : ""}`,
    )
    .join("");
  const next = record.followUp?.dateTime
    ? `<div class="next"><strong>Next appointment:</strong> ${esc(record.followUp.dateTime.replace("T", " "))}${
        record.followUp.reason ? ` — ${esc(record.followUp.reason)}` : ""
      }</div>`
    : "";
  printHtml(`
    ${clinicHeader(settings, "Prescription")}
    ${patientLine(record, patient)}
    <table>
      <thead><tr><th>Medication</th><th>Dose</th><th>Route</th><th>Frequency</th><th>Qty</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${next}
    <div class="sig"><div>Owner signature</div><div>${esc(record.vet)}</div></div>
  `);
  return true;
}

export function printInvoice(record: MedicalRecord, patient: Patient | undefined, settings: ClinicSettings) {
  const rows = record.charges
    .map(
      (c) => `
      <tr>
        <td>${esc(c.description)}</td>
        <td style="text-align:right">${c.qty}</td>
        <td style="text-align:right">${money(c.unitPrice, settings.currency)}</td>
        <td style="text-align:right">${money(c.qty * c.unitPrice, settings.currency)}</td>
      </tr>`,
    )
    .join("");
  const total = record.charges.reduce((sum, c) => sum + c.qty * c.unitPrice, 0);
  printHtml(`
    ${clinicHeader(settings, record.paid ? "Receipt" : "Invoice")}
    ${patientLine(record, patient)}
    ${
      record.charges.length
        ? `<table>
             <thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Amount</th></tr></thead>
             <tbody>${rows}</tbody>
           </table>
           <div class="totals">
             <p class="grand">Total: ${money(total, settings.currency)}</p>
             <p>${record.paid ? "PAID — thank you" : "Amount due"}</p>
           </div>`
        : `<p class="note">No charges recorded for this visit.</p>`
    }
    ${record.assessment ? `<h2>Diagnosis</h2><p>${esc(record.assessment)}</p>` : ""}
    ${
      record.followUp?.dateTime
        ? `<div class="next"><strong>Next appointment:</strong> ${esc(record.followUp.dateTime.replace("T", " "))}</div>`
        : ""
    }
    <div class="sig"><div>Owner signature</div><div>${esc(record.vet)}</div></div>
  `);
  return true;
}

export function printVisitSummary(
  record: MedicalRecord,
  patient: Patient | undefined,
  settings: ClinicSettings,
  followUpAppointment?: Appointment,
) {
  const vitals = [
    record.vitals.weightKg && `Weight ${esc(record.vitals.weightKg)} kg`,
    record.vitals.temperatureC && `Temp ${esc(record.vitals.temperatureC)} °C`,
    record.vitals.heartRate && `HR ${esc(record.vitals.heartRate)}`,
    record.vitals.respRate && `RR ${esc(record.vitals.respRate)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const section = (title: string, text: string) =>
    text.trim() ? `<h2>${title}</h2><p>${esc(text)}</p>` : "";
  printHtml(`
    ${clinicHeader(settings, "Visit Summary")}
    ${patientLine(record, patient)}
    ${vitals ? `<p><strong>Vitals:</strong> ${vitals}</p>` : ""}
    ${section("Subjective", record.subjective)}
    ${section("Objective", record.objective)}
    ${section("Assessment", record.assessment)}
    ${section("Plan", record.plan)}
    ${
      record.prescriptions.length
        ? `<h2>Medications</h2><table>
             <thead><tr><th>Medication</th><th>Dose</th><th>Route</th><th>Frequency</th></tr></thead>
             <tbody>${record.prescriptions
               .map(
                 (p) =>
                   `<tr><td>${esc(p.drug)}</td><td>${esc(p.dose)}</td><td>${esc(p.route)}</td><td>${esc(p.frequency)}</td></tr>`,
               )
               .join("")}</tbody>
           </table>`
        : ""
    }
    ${
      followUpAppointment?.dateTime
        ? `<div class="next"><strong>Next appointment:</strong> ${esc(followUpAppointment.dateTime.replace("T", " "))}${
            followUpAppointment.reason ? ` — ${esc(followUpAppointment.reason)}` : ""
          }</div>`
        : ""
    }
  `);
  return true;
}
