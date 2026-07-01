"""Generates 8 Pinterest pins (1000x1500, the platform's recommended 2:3
ratio) for Freelance Finance Hub. Each targets a different long-tail
keyword angle so they can be tested against each other once live."""

import os
from playwright.sync_api import sync_playwright

OUT = "/home/user/habit-tracker/digital-products/freelancer-finance-hub/marketing/pinterest/pins"
os.makedirs(OUT, exist_ok=True)
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

CSS = """
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI', -apple-system, Arial, sans-serif; }
  .card { background:#fff; border-radius:16px; box-shadow:0 4px 20px rgba(31,42,68,0.10); }
  table { border-collapse:collapse; width:100%; }
  th { background:#1F2A44; color:#fff; padding:8px 10px; font-size:13px; text-align:left; }
  td { padding:8px 10px; font-size:13px; border-bottom:1px solid #E5E9E7; color:#222; }
  .pill { display:inline-block; padding:2px 9px; border-radius:16px; font-size:11px; font-weight:700; }
  .paid { background:#DCF3E7; color:#1E7A4C; }
  .cta { display:inline-block; background:#F2C94C; color:#1F2A44; font-weight:800; font-size:22px;
         padding:16px 34px; border-radius:40px; }
</style>
"""

def render(name, body_html):
    html = f"<html><head>{CSS}</head><body style='width:1000px;height:1500px;overflow:hidden;'>{body_html}</body></html>"
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)
        pg = browser.new_page(viewport={"width": 1000, "height": 1500})
        pg.set_content(html)
        pg.screenshot(path=f"{OUT}/{name}.png")
        browser.close()
    print("rendered", name)

# ------------------------------------------------------------ Pin 1: Tax pain point
render("pin-01-tax-set-aside", f"""
<div style="width:1000px;height:1500px;background:linear-gradient(160deg,#1F2A44,#2E7D6B);
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            color:#fff;padding:70px;text-align:center;">
  <div style="font-size:24px;opacity:0.85;letter-spacing:2px;">FREELANCE TAX TRACKER</div>
  <div style="font-size:56px;font-weight:800;margin-top:22px;line-height:1.15;">Stop Guessing How<br>Much to Set Aside<br>for Tax</div>
  <div class="card" style="margin-top:50px;padding:36px 44px;color:#1F2A44;">
    <div style="font-size:16px;color:#5B6470;">This quarter, automatically:</div>
    <div style="font-size:52px;font-weight:800;color:#2E7D6B;margin-top:6px;">$160.00</div>
  </div>
  <div style="margin-top:56px;" class="cta">Freelance Finance Hub</div>
  <div style="margin-top:20px;font-size:18px;opacity:0.9;">Google Sheets + Excel &bull; $19</div>
</div>
""")

# ------------------------------------------------------------ Pin 2: Invoice automation
render("pin-02-invoice-numbers", f"""
<div style="width:1000px;height:1500px;background:#EFF3F1;display:flex;flex-direction:column;
            align-items:center;justify-content:center;padding:70px 60px;text-align:center;">
  <div style="font-size:42px;font-weight:800;color:#1F2A44;line-height:1.2;">Automatic Invoice<br>Numbers. Every Time.</div>
  <div style="font-size:18px;color:#5B6470;margin-top:16px;">No more "was that INV-014 or 015?"</div>
  <div class="card" style="margin-top:44px;padding:24px;width:100%;">
    <table>
      <tr><th>Invoice #</th><th>Client</th><th>Total</th><th>Status</th></tr>
      <tr><td>INV-1006</td><td>Kite &amp; Co</td><td>$1,200.00</td><td><span class="pill paid">Paid</span></td></tr>
      <tr><td>INV-1007</td><td>Aroha Digital</td><td>$850.00</td><td><span class="pill" style="background:#FDF1D6;color:#9C6B00;">Unpaid</span></td></tr>
      <tr><td>INV-1008</td><td>Aroha Digital</td><td>$640.00</td><td><span class="pill paid">Paid</span></td></tr>
    </table>
  </div>
  <div style="margin-top:56px;color:#1F2A44;font-size:20px;font-weight:700;">Type the amount. Everything else fills itself in.</div>
  <div style="margin-top:44px;" class="cta">Freelance Finance Hub</div>
</div>
""")

# ------------------------------------------------------------ Pin 3: Compatibility
render("pin-03-works-anywhere", f"""
<div style="width:1000px;height:1500px;background:#fff;display:flex;flex-direction:column;
            align-items:center;justify-content:center;padding:70px;text-align:center;">
  <div style="font-size:44px;font-weight:800;color:#1F2A44;line-height:1.2;">Works in Google<br>Sheets &amp; Excel</div>
  <div style="font-size:18px;color:#5B6470;margin-top:14px;">No add-ons. No subscriptions. No Notion account required.</div>
  <div style="display:flex;gap:26px;margin-top:50px;">
    <div class="card" style="padding:34px;width:260px;">
      <div style="font-size:44px;">&#128202;</div>
      <div style="font-size:19px;font-weight:800;color:#1F2A44;margin-top:8px;">Google Sheets</div>
    </div>
    <div class="card" style="padding:34px;width:260px;">
      <div style="font-size:44px;">&#128221;</div>
      <div style="font-size:19px;font-weight:800;color:#1F2A44;margin-top:8px;">Microsoft Excel</div>
    </div>
  </div>
  <div style="margin-top:64px;" class="cta">Freelance Finance Hub</div>
  <div style="margin-top:18px;font-size:16px;color:#5B6470;">One-time $19 &bull; Instant download</div>
</div>
""")

# ------------------------------------------------------------ Pin 4: Feature checklist
render("pin-04-whats-included", f"""
<div style="width:1000px;height:1500px;background:#EFF3F1;padding:70px 60px;display:flex;flex-direction:column;justify-content:center;">
  <div style="font-size:40px;font-weight:800;color:#1F2A44;text-align:center;">Everything a Freelancer<br>Needs to Get Paid</div>
  <div class="card" style="margin-top:44px;padding:36px 40px;">
    {"".join(f'''<div style="display:flex;align-items:center;gap:14px;padding:16px 0;border-bottom:1px solid #E5E9E7;">
        <div style="width:28px;height:28px;border-radius:50%;background:#2E7D6B;color:#fff;
                    display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">&check;</div>
        <div style="font-size:19px;color:#222;">{f}</div>
      </div>''' for f in [
        "Auto invoice numbers", "Live tax &amp; GST math", "Client dropdown list",
        "Paid / Unpaid / Overdue tracking", "Printable invoice template",
        "Automatic tax set-aside calculator",
    ])}
  </div>
  <div style="text-align:center;margin-top:50px;"><span class="cta">Freelance Finance Hub</span></div>
</div>
""")

# ------------------------------------------------------------ Pin 5: Differentiation
render("pin-05-does-your-tax-math", f"""
<div style="width:1000px;height:1500px;background:linear-gradient(160deg,#2E7D6B,#1F2A44);
            color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;
            padding:70px;text-align:center;">
  <div style="font-size:22px;opacity:0.85;letter-spacing:1px;">MOST INVOICE TEMPLATES JUST SIT THERE.</div>
  <div style="font-size:50px;font-weight:800;margin-top:20px;line-height:1.2;">This One Does Your<br>Tax Math For You</div>
  <div style="font-size:18px;opacity:0.9;margin-top:26px;max-width:760px;">
    Set your tax rate once. Every invoice, every quarter, every dollar you need to set aside &mdash; calculated automatically.
  </div>
  <div style="margin-top:56px;" class="cta">Freelance Finance Hub</div>
</div>
""")

# ------------------------------------------------------------ Pin 6: Persona / pain
render("pin-06-hate-spreadsheets", f"""
<div style="width:1000px;height:1500px;background:#fff;display:flex;flex-direction:column;
            align-items:center;justify-content:center;padding:70px;text-align:center;">
  <div style="font-size:42px;font-weight:800;color:#1F2A44;line-height:1.25;">
    Hate Doing Your<br>Freelance Books?<br><span style="color:#2E7D6B;">This One's Different.</span>
  </div>
  <div style="font-size:18px;color:#5B6470;margin-top:22px;max-width:700px;">
    No formulas to build. No manual tax math. Add a client, log an invoice &mdash; the rest runs itself.
  </div>
  <div style="margin-top:56px;" class="cta">Freelance Finance Hub</div>
  <div style="margin-top:18px;font-size:16px;color:#5B6470;">Google Sheets + Excel &bull; $19 one-time</div>
</div>
""")

# ------------------------------------------------------------ Pin 7: Dashboard visual
render("pin-07-dashboard-preview", f"""
<div style="width:1000px;height:1500px;background:#EFF3F1;padding:70px 50px;display:flex;flex-direction:column;justify-content:center;">
  <div style="font-size:36px;font-weight:800;color:#1F2A44;text-align:center;">See Your Whole<br>Freelance Business at a Glance</div>
  <div class="card" style="margin-top:40px;padding:28px;">
    <div style="display:flex;gap:14px;">
      <div style="flex:1;background:#F7F9F8;border-radius:10px;padding:16px;">
        <div style="font-size:12px;color:#5B6470;">Total Paid (YTD)</div>
        <div style="font-size:22px;font-weight:800;color:#2E7D6B;">$3,960</div>
      </div>
      <div style="flex:1;background:#F7F9F8;border-radius:10px;padding:16px;">
        <div style="font-size:12px;color:#5B6470;">Tax Set-Aside</div>
        <div style="font-size:22px;font-weight:800;color:#2E7D6B;">$160</div>
      </div>
    </div>
    <div style="display:flex;align-items:flex-end;height:170px;gap:8px;margin-top:26px;">
      {"".join(f'<div style="flex:1;background:#2E7D6B;border-radius:4px 4px 0 0;height:{h}px;"></div>' for h in [10,10,10,90,170,90,68,10,10,10,10,10])}
    </div>
  </div>
  <div style="text-align:center;margin-top:50px;"><span class="cta">Freelance Finance Hub</span></div>
</div>
""")

# ------------------------------------------------------------ Pin 8: Price/value
render("pin-08-pricing", f"""
<div style="width:1000px;height:1500px;background:linear-gradient(160deg,#1F2A44,#2E7D6B);
            color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;
            padding:70px;text-align:center;">
  <div style="font-size:26px;opacity:0.85;">ONE-TIME PAYMENT</div>
  <div style="font-size:100px;font-weight:800;margin-top:10px;">$19</div>
  <div style="font-size:22px;opacity:0.9;margin-top:6px;">No subscription. Yours forever.</div>
  <div style="font-size:20px;margin-top:40px;max-width:640px;opacity:0.95;">
    Invoicing, income tracking, and automatic tax set-aside &mdash; for less than an hour of your own freelance rate.
  </div>
  <div style="margin-top:56px;" class="cta">Freelance Finance Hub</div>
</div>
""")

print("all pins rendered")
