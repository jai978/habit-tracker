"""Renders marketplace preview images (cover + product mockups) with Playwright.
Values here mirror what the live formulas in the workbook compute for the
demo data, so the previews are an honest representation of the product."""

import os
from playwright.sync_api import sync_playwright

OUT = "/home/user/habit-tracker/digital-products/freelancer-finance-hub/previews"
os.makedirs(OUT, exist_ok=True)

BASE_CSS = """
<style>
  * { box-sizing: border-box; margin:0; padding:0; }
  body { font-family: 'Segoe UI', -apple-system, Arial, sans-serif; background:#EFF3F1; }
  .navy { color:#1F2A44 } .teal { color:#2E7D6B } .amber { color:#C98A00 } .red { color:#C24545 }
  .card { background:#fff; border-radius:14px; box-shadow: 0 2px 10px rgba(31,42,68,0.08); }
  table { border-collapse: collapse; width:100%; }
  th { background:#1F2A44; color:#fff; padding:10px 12px; font-size:14px; text-align:left; }
  td { padding:9px 12px; font-size:14px; border-bottom:1px solid #E5E9E7; color:#222; }
  .pill { display:inline-block; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:600; }
  .pill.paid { background:#DCF3E7; color:#1E7A4C; }
  .pill.unpaid { background:#FDF1D6; color:#9C6B00; }
  .pill.overdue { background:#FBE2E2; color:#B23A3A; }
</style>
"""

def page(body, w, h):
    return f"<html><head>{BASE_CSS}</head><body style='width:{w}px;height:{h}px;overflow:hidden;'>{body}</body></html>"

def render(name, html, w=1600, h=1200):
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        pg = browser.new_page(viewport={"width": w, "height": h})
        pg.set_content(html)
        pg.screenshot(path=f"{OUT}/{name}.png")
        browser.close()
    print("rendered", name)

# ---------------------------------------------------------------- 1. Cover
cover = f"""
<div style="width:1600px;height:1600px;background:linear-gradient(135deg,#1F2A44,#2E7D6B);
            display:flex;flex-direction:column;justify-content:center;align-items:center;color:#fff;padding:80px;">
  <div style="font-size:26px;letter-spacing:4px;opacity:0.85;margin-bottom:18px;">FOR GOOGLE SHEETS &amp; EXCEL</div>
  <div style="font-size:72px;font-weight:800;text-align:center;line-height:1.1;">Freelance<br>Finance Hub</div>
  <div style="font-size:30px;margin-top:26px;opacity:0.95;text-align:center;">Invoice Generator &bull; Income Log<br>Tax Set-Aside Dashboard</div>
  <div style="margin-top:56px;background:#F2C94C;color:#1F2A44;font-weight:700;font-size:26px;
              padding:16px 40px;border-radius:40px;">Automatic invoice #s, totals &amp; tax math</div>
</div>
"""
render("01-cover", page(cover, 1600, 1600), 1600, 1600)

# ---------------------------------------------------------------- 2. Dashboard
months = [("Jan",0),("Feb",0),("Mar",0),("Apr",850),("May",1620),("Jun",850),("Jul",640),
          ("Aug",0),("Sep",0),("Oct",0),("Nov",0),("Dec",0)]
maxv = max(v for _, v in months) or 1
bars = "".join(
    f"""<div style="display:flex;flex-direction:column;align-items:center;flex:1;">
          <div style="font-size:11px;color:#5B6470;margin-bottom:4px;">{'${:,.0f}'.format(v) if v else ''}</div>
          <div style="width:60%;height:{max(int(v/maxv*160),3)}px;background:#2E7D6B;border-radius:4px 4px 0 0;"></div>
          <div style="font-size:12px;margin-top:6px;color:#1F2A44;">{m}</div>
        </div>"""
    for m, v in months
)
dashboard = f"""
<div style="width:1600px;height:620px;padding:44px 56px;">
  <div style="font-size:34px;font-weight:800;" class="navy">Dashboard</div>
  <div style="font-size:16px;color:#5B6470;margin-bottom:24px;">Updates automatically from the Invoice Log</div>
  <div style="display:flex;gap:20px;margin-bottom:26px;">
    <div class="card" style="flex:1;padding:20px;"><div style="font-size:13px;color:#5B6470;">Total Invoiced (YTD)</div>
      <div style="font-size:28px;font-weight:800;" class="navy">$6,310.00</div></div>
    <div class="card" style="flex:1;padding:20px;"><div style="font-size:13px;color:#5B6470;">Total Paid (YTD)</div>
      <div style="font-size:28px;font-weight:800;" class="teal">$3,960.00</div></div>
    <div class="card" style="flex:1;padding:20px;"><div style="font-size:13px;color:#5B6470;">Outstanding</div>
      <div style="font-size:28px;font-weight:800;" class="amber">$2,350.00</div></div>
    <div class="card" style="flex:1;padding:20px;"><div style="font-size:13px;color:#5B6470;">Overdue</div>
      <div style="font-size:28px;font-weight:800;" class="red">$300.00</div></div>
  </div>
  <div style="display:flex;gap:20px;">
    <div class="card" style="flex:1.4;padding:24px;">
      <div style="font-size:16px;font-weight:700;margin-bottom:14px;" class="navy">Paid Income by Month</div>
      <div style="display:flex;align-items:flex-end;height:200px;gap:6px;">{bars}</div>
    </div>
    <div class="card" style="flex:1;padding:24px;">
      <div style="font-size:16px;font-weight:700;margin-bottom:14px;" class="navy">Tax Set-Aside &mdash; This Quarter</div>
      <div style="font-size:40px;font-weight:800;" class="teal">$160.00</div>
      <div style="font-size:13px;color:#5B6470;margin-top:6px;">at a 25% set-aside rate</div>
      <div style="margin-top:26px;font-size:14px;color:#5B6470;">Recalculates automatically every quarter as invoices get marked Paid.</div>
    </div>
  </div>
</div>
"""
render("02-dashboard", page(dashboard, 1600, 620), 1600, 620)

# ---------------------------------------------------------------- 3. Invoice Log
rows = [
    ("INV-1001","Aroha Digital Ltd","Website maintenance - June","$850.00","$0.00","$850.00","paid","Paid"),
    ("INV-1002","Northside Cafe","Menu redesign","$420.00","$0.00","$420.00","paid","Paid"),
    ("INV-1003","Kite & Co","Brand refresh - phase 1","$1,200.00","$0.00","$1,200.00","paid","Paid"),
    ("INV-1004","Aroha Digital Ltd","Website maintenance - July","$850.00","$0.00","$850.00","paid","Paid"),
    ("INV-1005","Northside Cafe","Social media graphics pack","$300.00","$0.00","$300.00","overdue","Overdue"),
    ("INV-1006","Kite & Co","Brand refresh - phase 2","$1,200.00","$0.00","$1,200.00","unpaid","Unpaid"),
    ("INV-1007","Aroha Digital Ltd","Website maintenance - August","$850.00","$0.00","$850.00","unpaid","Unpaid"),
    ("INV-1008","Aroha Digital Ltd","Logo refresh - quick turnaround","$640.00","$0.00","$640.00","paid","Paid"),
]
tr = "".join(
    f"""<tr><td>{n}</td><td>{c}</td><td>{d}</td><td>{a}</td><td>{t}</td><td>{tot}</td>
        <td><span class="pill {cls}">{status}</span></td></tr>"""
    for n, c, d, a, t, tot, cls, status in rows
)
invlog = f"""
<div style="width:1600px;height:560px;padding:44px 56px;">
  <div style="font-size:34px;font-weight:800;" class="navy">Invoice Log</div>
  <div style="font-size:16px;color:#5B6470;margin-bottom:20px;">Invoice #, tax and totals calculate automatically as you type</div>
  <div class="card" style="overflow:hidden;">
    <table><tr><th>Invoice #</th><th>Client</th><th>Description</th><th>Amount</th><th>Tax</th><th>Total</th><th>Status</th></tr>
      {tr}
    </table>
  </div>
</div>
"""
render("03-invoice-log", page(invlog, 1600, 560), 1600, 560)

# ---------------------------------------------------------------- 4. Invoice (Print)
invoice_print = """
<div style="width:1600px;height:660px;padding:50px 90px;">
  <div class="card" style="padding:56px;">
    <div style="display:flex;justify-content:space-between;">
      <div>
        <div style="font-size:26px;font-weight:800;" class="navy">Jordan Smith Design</div>
        <div style="color:#5B6470;">hello@example.com</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:34px;font-weight:800;" class="teal">INVOICE</div>
        <div class="navy" style="font-weight:700;">#INV-1003</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:46px;">
      <div>
        <div style="font-size:13px;color:#5B6470;font-weight:700;">BILL TO</div>
        <div style="font-size:18px;margin-top:6px;">Kite & Co</div>
        <div style="color:#5B6470;">finance@kiteandco.com</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:13px;color:#5B6470;font-weight:700;">ISSUE DATE &nbsp;&nbsp;&nbsp; DUE DATE</div>
        <div style="font-size:16px;margin-top:6px;">22 May 2026 &nbsp;&nbsp;&nbsp; 5 Jun 2026</div>
      </div>
    </div>
    <table style="margin-top:40px;">
      <tr><th>Description</th><th>Amount</th><th>Tax</th><th>Total</th></tr>
      <tr><td>Brand refresh - phase 1</td><td>$1,200.00</td><td>$0.00</td><td>$1,200.00</td></tr>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-top:30px;">
      <div style="text-align:right;">
        <div style="font-size:15px;color:#5B6470;">Total Due</div>
        <div style="font-size:34px;font-weight:800;" class="teal">$1,200.00</div>
      </div>
    </div>
    <div style="margin-top:40px;color:#5B6470;font-style:italic;">Thank you for your business!</div>
  </div>
</div>
"""
render("04-invoice-print", page(invoice_print, 1600, 660), 1600, 660)

# ---------------------------------------------------------------- 5. Setup + Clients
setup_clients = """
<div style="width:1600px;height:560px;padding:44px 56px;display:flex;gap:24px;">
  <div class="card" style="flex:1;padding:32px;">
    <div style="font-size:26px;font-weight:800;" class="navy">Setup</div>
    <div style="color:#5B6470;margin-bottom:18px;">Fill in once &mdash; everything updates automatically</div>
    <table>
      <tr><td style="font-weight:700;">Business Name</td><td>Jordan Smith Design</td></tr>
      <tr><td style="font-weight:700;">Invoice Tax / GST Rate</td><td>0%</td></tr>
      <tr><td style="font-weight:700;">Tax Set-Aside %</td><td>25%</td></tr>
      <tr><td style="font-weight:700;">Invoice Prefix</td><td>INV-</td></tr>
      <tr><td style="font-weight:700;">Starting Invoice #</td><td>1001</td></tr>
    </table>
  </div>
  <div class="card" style="flex:1;padding:32px;">
    <div style="font-size:26px;font-weight:800;" class="navy">Clients</div>
    <div style="color:#5B6470;margin-bottom:18px;">Add once, then pick from a dropdown on every invoice</div>
    <table>
      <tr><th>Client</th><th>Email</th><th>Rate</th></tr>
      <tr><td>Aroha Digital Ltd</td><td>accounts@arohadigital.co.nz</td><td>$85</td></tr>
      <tr><td>Northside Cafe</td><td>owner@northsidecafe.com</td><td>$60</td></tr>
      <tr><td>Kite & Co</td><td>finance@kiteandco.com</td><td>$95</td></tr>
    </table>
  </div>
</div>
"""
render("05-setup-clients", page(setup_clients, 1600, 560), 1600, 560)

# ---------------------------------------------------------------- 6. What's included
features = [
    "Auto-generated invoice numbers", "Live tax & GST calculation", "Client dropdown (add once, reuse everywhere)",
    "Paid / Unpaid / Overdue tracking with color coding", "Printable, professional invoice template",
    "Income-by-month chart", "Automatic quarterly tax set-aside calculator", "Works in Excel and Google Sheets",
]
feat_html = "".join(
    f"""<div style="display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid #E5E9E7;">
          <div style="width:26px;height:26px;border-radius:50%;background:#2E7D6B;color:#fff;
                      display:flex;align-items:center;justify-content:center;font-size:15px;">&check;</div>
          <div style="font-size:19px;color:#222;">{f}</div>
        </div>"""
    for f in features
)
included = f"""
<div style="width:1600px;height:760px;padding:60px 90px;">
  <div style="font-size:34px;font-weight:800;" class="navy">What's Included</div>
  <div style="color:#5B6470;font-size:17px;margin-bottom:20px;">6 connected tabs. No manual math, ever.</div>
  <div class="card" style="padding:36px 44px;">{feat_html}</div>
</div>
"""
render("06-whats-included", page(included, 1600, 760), 1600, 760)

# ---------------------------------------------------------------- 7. Compatibility
compat = """
<div style="width:1600px;height:750px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
  <div style="font-size:32px;font-weight:800;" class="navy">Works Where You Already Work</div>
  <div style="display:flex;gap:60px;margin-top:56px;">
    <div class="card" style="width:420px;padding:40px;text-align:center;">
      <div style="font-size:52px;">&#128202;</div>
      <div style="font-size:24px;font-weight:800;margin-top:10px;" class="navy">Google Sheets</div>
      <div style="color:#5B6470;margin-top:10px;">File &gt; Import &gt; Upload. Ready in 30 seconds.</div>
    </div>
    <div class="card" style="width:420px;padding:40px;text-align:center;">
      <div style="font-size:52px;">&#128221;</div>
      <div style="font-size:24px;font-weight:800;margin-top:10px;" class="navy">Microsoft Excel</div>
      <div style="color:#5B6470;margin-top:10px;">Just open the file. Formulas, dropdowns &amp; charts work instantly.</div>
    </div>
  </div>
  <div style="margin-top:56px;font-size:16px;color:#5B6470;">No add-ons, plugins or subscriptions required.</div>
</div>
"""
render("07-compatibility", page(compat, 1600, 750), 1600, 750)

# ---------------------------------------------------------------- 8. Tax highlight
tax_highlight = """
<div style="width:1600px;height:750px;background:linear-gradient(135deg,#F5F8F7,#E6EEEA);
            display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px;">
  <div style="font-size:28px;color:#5B6470;">Stop guessing how much to set aside for tax</div>
  <div style="font-size:64px;font-weight:800;margin-top:14px;" class="teal">$160.00</div>
  <div style="font-size:20px;color:#5B6470;margin-top:6px;">to set aside this quarter, calculated automatically</div>
  <div class="card" style="margin-top:44px;padding:24px 40px;font-size:18px;" class="navy">
    Set your own % once in Setup &mdash; the dashboard recalculates every time you mark an invoice Paid.
  </div>
</div>
"""
render("08-tax-highlight", page(tax_highlight, 1600, 750), 1600, 750)

print("all previews rendered")
