"""Builds the Freelance Finance Hub workbook: invoice generator, income log,
and tax set-aside dashboard, with real formulas (not just static tables)."""

import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, NamedStyle
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.chart import BarChart, PieChart, Reference
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from datetime import date, timedelta

NAVY = "1F2A44"
TEAL = "2E7D6B"
LIGHT = "EFF3F1"
WHITE = "FFFFFF"
AMBER = "F2C94C"
RED = "E36464"
GREEN = "8FD3B0"

HEADER_FONT = Font(name="Calibri", size=11, bold=True, color=WHITE)
HEADER_FILL = PatternFill("solid", fgColor=NAVY)
TITLE_FONT = Font(name="Calibri", size=20, bold=True, color=NAVY)
SUBTITLE_FONT = Font(name="Calibri", size=11, color="5B6470")
LABEL_FONT = Font(name="Calibri", size=11, bold=True, color=NAVY)
BODY_FONT = Font(name="Calibri", size=11, color="222222")
THIN = Side(style="thin", color="D0D5DD")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

wb = Workbook()

def style_header_row(ws, row, last_col):
    for c in range(1, last_col + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(vertical="center", horizontal="center", wrap_text=True)
        cell.border = BORDER

def set_widths(ws, widths):
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

# ---------------------------------------------------------------- Read Me
ws = wb.active
ws.title = "Read Me"
ws.sheet_view.showGridLines = False
set_widths(ws, [3, 90])
ws["B2"] = "Freelance Finance Hub"
ws["B2"].font = TITLE_FONT
ws["B3"] = "Invoice Generator - Income Log - Tax Set-Aside Dashboard"
ws["B3"].font = SUBTITLE_FONT

lines = [
    ("", ""),
    ("1. Setup tab", "Enter your business name, email, currency, tax/GST rate, and the % of "
                      "income you want to automatically set aside for tax. Every other tab reads from here."),
    ("2. Clients tab", "Add each client once. They'll then appear in the dropdown on the Invoice Log tab."),
    ("3. Invoice Log tab", "Add one row per invoice. Invoice numbers, tax and totals calculate automatically. "
                            "Change Status to Paid/Unpaid/Overdue as invoices move through their lifecycle."),
    ("4. Invoice (Print) tab", "Pick an invoice number from the dropdown at the top and a clean, "
                                "print-ready invoice fills in automatically. Print to PDF to send to your client."),
    ("5. Dashboard tab", "Shows income by month, outstanding vs paid, and exactly how much to set aside "
                          "for tax this quarter, updated live from the Invoice Log."),
    ("", ""),
    ("Compatible with", "Excel and Google Sheets (File > Import > Upload in Sheets)."),
    ("Before you start", "Demo data is included so you can see it working. Delete the sample rows in "
                          "Clients and Invoice Log before adding your own."),
    ("Support", "Questions? Message me through the marketplace and I'll help you out."),
]
r = 5
for label, body in lines:
    ws.cell(row=r, column=2, value=label).font = LABEL_FONT
    r += 1
    if body:
        cell = ws.cell(row=r, column=2, value=body)
        cell.font = BODY_FONT
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[r].height = 30
        r += 1
    r += 1

# ---------------------------------------------------------------- Setup
ws = wb.create_sheet("Setup")
ws.sheet_view.showGridLines = False
set_widths(ws, [3, 28, 24, 3, 60])
ws["B2"] = "Setup"
ws["B2"].font = TITLE_FONT
ws["B3"] = "Fill this in once - everything else updates automatically."
ws["B3"].font = SUBTITLE_FONT

setup_fields = [
    ("Business / Your Name", "Jordan Smith Design", "e.g. your business name or your own name as it should appear on invoices"),
    ("Email", "hello@example.com", "shown on the printed invoice"),
    ("Currency Symbol", "$", "e.g. $, NZ$, £, €"),
    ("Invoice Tax / GST Rate", 0.0, "as a decimal, e.g. 0.15 for 15%. Use 0 if you don't charge tax on invoices"),
    ("Tax Set-Aside %", 0.25, "portion of paid income to set aside for your own income tax, e.g. 0.25 = 25%"),
    ("Invoice Number Prefix", "INV-", "e.g. INV- becomes INV-1001, INV-1002..."),
    ("Starting Invoice Number", 1001, "the first invoice number to count up from"),
]
start_row = 5
for i, (label, value, note) in enumerate(setup_fields):
    row = start_row + i
    ws.cell(row=row, column=2, value=label).font = LABEL_FONT
    vcell = ws.cell(row=row, column=3, value=value)
    vcell.font = BODY_FONT
    vcell.fill = PatternFill("solid", fgColor=LIGHT)
    vcell.border = BORDER
    if label == "Invoice Tax / GST Rate" or label == "Tax Set-Aside %":
        vcell.number_format = "0%"
    note_cell = ws.cell(row=row, column=5, value=note)
    note_cell.font = Font(name="Calibri", size=10, italic=True, color="8A8F98")
    note_cell.alignment = Alignment(wrap_text=True)

# Defined names pointing at Setup cells
row_map = {label: start_row + i for i, (label, _, _) in enumerate(setup_fields)}
def define(name, ref):
    wb.defined_names[name] = DefinedName(name, attr_text=ref)

define("BizName", f"Setup!$C${row_map['Business / Your Name']}")
define("BizEmail", f"Setup!$C${row_map['Email']}")
define("Currency", f"Setup!$C${row_map['Currency Symbol']}")
define("TaxRate", f"Setup!$C${row_map['Invoice Tax / GST Rate']}")
define("SetAsidePct", f"Setup!$C${row_map['Tax Set-Aside %']}")
define("InvoicePrefix", f"Setup!$C${row_map['Invoice Number Prefix']}")
define("StartNumber", f"Setup!$C${row_map['Starting Invoice Number']}")

# ---------------------------------------------------------------- Clients
ws = wb.create_sheet("Clients")
ws.sheet_view.showGridLines = False
headers = ["Client Name", "Contact Email", "Company", "Default Rate", "Notes"]
set_widths(ws, [24, 26, 22, 14, 34])
for c, h in enumerate(headers, start=1):
    ws.cell(row=1, column=c, value=h)
style_header_row(ws, 1, len(headers))

clients_demo = [
    ("Aroha Digital Ltd", "accounts@arohadigital.co.nz", "Aroha Digital", 85, "Prefers monthly invoices"),
    ("Northside Cafe", "owner@northsidecafe.com", "Northside Cafe", 60, "Pays via bank transfer"),
    ("Kite & Co", "finance@kiteandco.com", "Kite & Co", 95, "Net 14 terms"),
]
for i, row_data in enumerate(clients_demo, start=2):
    for c, val in enumerate(row_data, start=1):
        cell = ws.cell(row=i, column=c, value=val)
        cell.font = BODY_FONT
        cell.border = BORDER
        if c == 4:
            cell.number_format = f'"$"#,##0.00'
for r_ in range(len(clients_demo) + 2, 60):
    for c in range(1, 6):
        ws.cell(row=r_, column=c).border = BORDER
define("ClientList", "Clients!$A$2:$A$100")

# ---------------------------------------------------------------- Invoice Log
ws = wb.create_sheet("Invoice Log")
ws.sheet_view.showGridLines = False
headers = ["Invoice #", "Client", "Issue Date", "Due Date", "Description", "Amount",
           "Tax Rate", "Tax Amount", "Total", "Status", "Date Paid", "Days Overdue", "Month", "Year"]
set_widths(ws, [12, 20, 12, 12, 28, 12, 10, 12, 12, 11, 12, 13, 8, 8])
for c, h in enumerate(headers, start=1):
    ws.cell(row=1, column=c, value=h)
style_header_row(ws, 1, len(headers))
ws.freeze_panes = "A2"

today = date.today()
demo_rows = [
    (1, "Aroha Digital Ltd", today - timedelta(days=70), today - timedelta(days=56), "Website maintenance - June", 850, "Paid", today - timedelta(days=60)),
    (2, "Northside Cafe", today - timedelta(days=55), today - timedelta(days=41), "Menu redesign", 420, "Paid", today - timedelta(days=44)),
    (3, "Kite & Co", today - timedelta(days=40), today - timedelta(days=26), "Brand refresh - phase 1", 1200, "Paid", today - timedelta(days=20)),
    (4, "Aroha Digital Ltd", today - timedelta(days=25), today - timedelta(days=11), "Website maintenance - July", 850, "Paid", today - timedelta(days=12)),
    (5, "Northside Cafe", today - timedelta(days=18), today - timedelta(days=4), "Social media graphics pack", 300, "Overdue", None),
    (6, "Kite & Co", today - timedelta(days=10), today + timedelta(days=4), "Brand refresh - phase 2", 1200, "Unpaid", None),
    (7, "Aroha Digital Ltd", today - timedelta(days=3), today + timedelta(days=11), "Website maintenance - August", 850, "Unpaid", None),
    (8, "Aroha Digital Ltd", today, today + timedelta(days=14), "Logo refresh - quick turnaround", 640, "Paid", today),
]

MAX_ROW = 300
last_data_row = 1 + len(demo_rows)
for i, (num, client, issue_d, due_d, desc, amount, status, paid_d) in enumerate(demo_rows, start=2):
    ws.cell(row=i, column=1, value=f'=IF(B{i}="","",InvoicePrefix&TEXT(StartNumber+ROW()-2,"0000"))')
    ws.cell(row=i, column=2, value=client)
    ws.cell(row=i, column=3, value=issue_d).number_format = "d mmm yyyy"
    ws.cell(row=i, column=4, value=due_d).number_format = "d mmm yyyy"
    ws.cell(row=i, column=5, value=desc)
    ws.cell(row=i, column=6, value=amount).number_format = '"$"#,##0.00'
    ws.cell(row=i, column=7, value="=TaxRate").number_format = "0%"
    ws.cell(row=i, column=8, value=f"=F{i}*G{i}").number_format = '"$"#,##0.00'
    ws.cell(row=i, column=9, value=f"=F{i}+H{i}").number_format = '"$"#,##0.00'
    ws.cell(row=i, column=10, value=status)
    if paid_d:
        ws.cell(row=i, column=11, value=paid_d).number_format = "d mmm yyyy"
    ws.cell(row=i, column=12, value=f'=IF(AND(J{i}<>"Paid",TODAY()>D{i}),TODAY()-D{i},0)')
    ws.cell(row=i, column=13, value=f"=IF(C{i}=\"\",\"\",MONTH(C{i}))")
    ws.cell(row=i, column=14, value=f"=IF(C{i}=\"\",\"\",YEAR(C{i}))")

# Pre-fill formulas down to MAX_ROW for future rows the buyer adds
for i in range(last_data_row + 1, MAX_ROW + 1):
    ws.cell(row=i, column=1, value=f'=IF(B{i}="","",InvoicePrefix&TEXT(StartNumber+ROW()-2,"0000"))')
    ws.cell(row=i, column=7, value="=TaxRate").number_format = "0%"
    ws.cell(row=i, column=8, value=f"=IF(B{i}=\"\",\"\",F{i}*G{i})").number_format = '"$"#,##0.00'
    ws.cell(row=i, column=9, value=f"=IF(B{i}=\"\",\"\",F{i}+H{i})").number_format = '"$"#,##0.00'
    ws.cell(row=i, column=12, value=f'=IF(B{i}="","",IF(AND(J{i}<>"Paid",TODAY()>D{i}),TODAY()-D{i},0))')
    ws.cell(row=i, column=13, value=f"=IF(C{i}=\"\",\"\",MONTH(C{i}))")
    ws.cell(row=i, column=14, value=f"=IF(C{i}=\"\",\"\",YEAR(C{i}))")

for r_ in range(2, MAX_ROW + 1):
    for c in range(1, 15):
        ws.cell(row=r_, column=c).border = BORDER
        ws.cell(row=r_, column=c).font = BODY_FONT
    ws.cell(row=r_, column=3).number_format = "d mmm yyyy"
    ws.cell(row=r_, column=4).number_format = "d mmm yyyy"
    ws.cell(row=r_, column=6).number_format = '"$"#,##0.00'
    ws.cell(row=r_, column=11).number_format = "d mmm yyyy"

# Data validation: Client dropdown, Status dropdown
dv_client = DataValidation(type="list", formula1="=ClientList", allow_blank=True)
ws.add_data_validation(dv_client)
dv_client.add(f"B2:B{MAX_ROW}")

dv_status = DataValidation(type="list", formula1='"Paid,Unpaid,Overdue"', allow_blank=True)
ws.add_data_validation(dv_status)
dv_status.add(f"J2:J{MAX_ROW}")

# Conditional formatting on Status
ws.conditional_formatting.add(
    f"J2:J{MAX_ROW}",
    CellIsRule(operator="equal", formula=['"Paid"'], fill=PatternFill("solid", fgColor=GREEN)),
)
ws.conditional_formatting.add(
    f"J2:J{MAX_ROW}",
    CellIsRule(operator="equal", formula=['"Unpaid"'], fill=PatternFill("solid", fgColor=AMBER)),
)
ws.conditional_formatting.add(
    f"J2:J{MAX_ROW}",
    CellIsRule(operator="equal", formula=['"Overdue"'], fill=PatternFill("solid", fgColor=RED)),
)
ws.conditional_formatting.add(
    f"L2:L{MAX_ROW}",
    FormulaRule(formula=[f"L2>0"], fill=PatternFill("solid", fgColor=RED)),
)

ws.column_dimensions.group("M", "N", hidden=True)

# ---------------------------------------------------------------- Invoice (Print)
ws = wb.create_sheet("Invoice (Print)")
ws.sheet_view.showGridLines = False
set_widths(ws, [4, 22, 22, 22, 18, 16])
ws.print_area = "A1:F40"
ws.page_setup.orientation = "portrait"
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 1
ws.sheet_properties.pageSetUpPr.fitToPage = True

ws["B2"] = "Select Invoice #:"
ws["B2"].font = LABEL_FONT
ws["C2"] = demo_rows[2][0] if demo_rows else ""
ws["C2"].value = 3
ws["C2"].fill = PatternFill("solid", fgColor=LIGHT)
ws["C2"].border = BORDER
dv_inv = DataValidation(type="list", formula1=f"='Invoice Log'!$A$2:$A${MAX_ROW}", allow_blank=True)
ws.add_data_validation(dv_inv)
dv_inv.add("C2")
# Match on the numeric row offset, since the picked value is text like INV-1003
ws["F2"] = '=MATCH(InvoicePrefix&TEXT(C2,"0000"),\'Invoice Log\'!$A:$A,0)'
ws["F2"].font = Font(color=WHITE, size=1)

ws["B4"] = "=BizName"
ws["B4"].font = Font(size=16, bold=True, color=NAVY)
ws["B5"] = "=BizEmail"
ws["B5"].font = SUBTITLE_FONT
ws["E4"] = "INVOICE"
ws["E4"].font = Font(size=22, bold=True, color=TEAL)
ws["E5"] = '=IFERROR("#"&INDEX(\'Invoice Log\'!$A:$A,$F$2),"")'
ws["E5"].font = LABEL_FONT

ws["B8"] = "Bill To"
ws["B8"].font = LABEL_FONT
ws["B9"] = "=IFERROR(INDEX('Invoice Log'!$B:$B,$F$2),\"\")"
ws["B9"].font = BODY_FONT
ws["B10"] = '=IFERROR(VLOOKUP(B9,Clients!$A:$C,2,FALSE),"")'
ws["B10"].font = BODY_FONT

ws["E8"] = "Issue Date"
ws["E8"].font = LABEL_FONT
ws["E9"] = "=IFERROR(INDEX('Invoice Log'!$C:$C,$F$2),\"\")"
ws["E9"].number_format = "d mmm yyyy"
ws["F8"] = "Due Date"
ws["F8"].font = LABEL_FONT
ws["F9"] = "=IFERROR(INDEX('Invoice Log'!$D:$D,$F$2),\"\")"
ws["F9"].number_format = "d mmm yyyy"

line_header_row = 13
for c, h in enumerate(["Description", "", "", "Amount", "Tax", "Total"], start=1):
    if h:
        cell = ws.cell(row=line_header_row, column=c, value=h)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.border = BORDER
ws.merge_cells(start_row=line_header_row, start_column=1, end_row=line_header_row, end_column=3)
ws.cell(row=line_header_row, column=1).alignment = Alignment(horizontal="center")

ws.merge_cells(start_row=14, start_column=1, end_row=14, end_column=3)
ws["A14"] = "=IFERROR(INDEX('Invoice Log'!$E:$E,$F$2),\"\")"
ws["A14"].font = BODY_FONT
ws["D14"] = "=IFERROR(INDEX('Invoice Log'!$F:$F,$F$2),\"\")"
ws["D14"].number_format = '"$"#,##0.00'
ws["E14"] = "=IFERROR(INDEX('Invoice Log'!$H:$H,$F$2),\"\")"
ws["E14"].number_format = '"$"#,##0.00'
ws["F14"] = "=IFERROR(INDEX('Invoice Log'!$I:$I,$F$2),\"\")"
ws["F14"].number_format = '"$"#,##0.00'
for c in range(1, 7):
    ws.cell(row=14, column=c).border = BORDER

ws["E17"] = "Total Due"
ws["E17"].font = Font(size=13, bold=True, color=NAVY)
ws["F17"] = "=IFERROR(INDEX('Invoice Log'!$I:$I,$F$2),\"\")"
ws["F17"].font = Font(size=13, bold=True, color=TEAL)
ws["F17"].number_format = '"$"#,##0.00'

ws["B20"] = "Status:"
ws["B20"].font = LABEL_FONT
ws["C20"] = "=IFERROR(INDEX('Invoice Log'!$J:$J,$F$2),\"\")"
ws["B22"] = "Thank you for your business!"
ws["B22"].font = Font(italic=True, color="8A8F98")

# ---------------------------------------------------------------- Dashboard
ws = wb.create_sheet("Dashboard")
ws.sheet_view.showGridLines = False
set_widths(ws, [3, 22, 16, 3, 16, 16, 3, 20])
ws["B2"] = "Dashboard"
ws["B2"].font = TITLE_FONT
ws["B3"] = "Updates automatically from the Invoice Log"
ws["B3"].font = SUBTITLE_FONT

stat_labels = [
    ("Total Invoiced (YTD)", "='Invoice Log'!$I$2+SUMIF('Invoice Log'!$N$2:$N$300,YEAR(TODAY()),'Invoice Log'!$I$2:$I$300)-'Invoice Log'!$I$2" ),
]
# Simpler + correct YTD sums:
ws["B6"] = "Total Invoiced (YTD)"
ws["B6"].font = LABEL_FONT
ws["B7"] = "=SUMIFS('Invoice Log'!$I$2:$I$300,'Invoice Log'!$N$2:$N$300,YEAR(TODAY()))"
ws["B7"].font = Font(size=16, bold=True, color=NAVY)
ws["B7"].number_format = '"$"#,##0.00'

ws["D6"] = "Total Paid (YTD)"
ws["D6"].font = LABEL_FONT
ws["D7"] = "=SUMIFS('Invoice Log'!$I$2:$I$300,'Invoice Log'!$N$2:$N$300,YEAR(TODAY()),'Invoice Log'!$J$2:$J$300,\"Paid\")"
ws["D7"].font = Font(size=16, bold=True, color=TEAL)
ws["D7"].number_format = '"$"#,##0.00'

ws["F6"] = "Outstanding"
ws["F6"].font = LABEL_FONT
ws["F7"] = "=SUMIFS('Invoice Log'!$I$2:$I$300,'Invoice Log'!$J$2:$J$300,\"Unpaid\")+SUMIFS('Invoice Log'!$I$2:$I$300,'Invoice Log'!$J$2:$J$300,\"Overdue\")"
ws["F7"].font = Font(size=16, bold=True, color=AMBER)
ws["F7"].number_format = '"$"#,##0.00'

ws["H6"] = "Overdue"
ws["H6"].font = LABEL_FONT
ws["H7"] = "=SUMIFS('Invoice Log'!$I$2:$I$300,'Invoice Log'!$J$2:$J$300,\"Overdue\")"
ws["H7"].font = Font(size=16, bold=True, color=RED)
ws["H7"].number_format = '"$"#,##0.00'

ws["B10"] = "Tax Set-Aside - This Quarter"
ws["B10"].font = LABEL_FONT
ws["B11"] = ('=SUMPRODUCT((\'Invoice Log\'!$N$2:$N$300=YEAR(TODAY()))*'
             '(\'Invoice Log\'!$M$2:$M$300>=ROUNDUP(MONTH(TODAY())/3,0)*3-2)*'
             '(\'Invoice Log\'!$M$2:$M$300<=ROUNDUP(MONTH(TODAY())/3,0)*3)*'
             '(\'Invoice Log\'!$J$2:$J$300="Paid")*\'Invoice Log\'!$I$2:$I$300)*SetAsidePct')
ws["B11"].font = Font(size=16, bold=True, color=TEAL)
ws["B11"].number_format = '"$"#,##0.00'
ws["D10"] = "Set-Aside Rate"
ws["D10"].font = LABEL_FONT
ws["D11"] = "=SetAsidePct"
ws["D11"].number_format = "0%"
ws["D11"].font = Font(size=16, bold=True, color=NAVY)

month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
ws["B14"] = "Month"
ws["C14"] = "Paid Income"
ws["B14"].font = LABEL_FONT
ws["C14"].font = LABEL_FONT
for i, mname in enumerate(month_names, start=1):
    row = 14 + i
    ws.cell(row=row, column=2, value=mname).font = BODY_FONT
    ws.cell(row=row, column=3,
            value=f"=SUMIFS('Invoice Log'!$I$2:$I$300,'Invoice Log'!$M$2:$M$300,{i},"
                  f"'Invoice Log'!$N$2:$N$300,YEAR(TODAY()),'Invoice Log'!$J$2:$J$300,\"Paid\")"
    ).number_format = '"$"#,##0.00'

chart = BarChart()
chart.type = "col"
chart.title = "Paid Income by Month"
chart.y_axis.title = "Amount"
chart.x_axis.title = "Month"
data = Reference(ws, min_col=3, min_row=14, max_row=26)
cats = Reference(ws, min_col=2, min_row=15, max_row=26)
chart.add_data(data, titles_from_data=True)
chart.set_categories(cats)
chart.height = 8
chart.width = 16
chart.series[0].graphicalProperties.solidFill = TEAL
ws.add_chart(chart, "E14")

pie = PieChart()
pie.title = "Paid vs Outstanding vs Overdue"
pie_labels_row = 29
ws.cell(row=pie_labels_row, column=2, value="Paid").font = BODY_FONT
ws.cell(row=pie_labels_row, column=3, value="=D7").number_format = '"$"#,##0.00'
ws.cell(row=pie_labels_row + 1, column=2, value="Unpaid (not yet overdue)").font = BODY_FONT
ws.cell(row=pie_labels_row + 1, column=3,
        value="=SUMIFS('Invoice Log'!$I$2:$I$300,'Invoice Log'!$J$2:$J$300,\"Unpaid\")").number_format = '"$"#,##0.00'
ws.cell(row=pie_labels_row + 2, column=2, value="Overdue").font = BODY_FONT
ws.cell(row=pie_labels_row + 2, column=3, value="=H7").number_format = '"$"#,##0.00'
pdata = Reference(ws, min_col=3, min_row=pie_labels_row, max_row=pie_labels_row + 2)
pcats = Reference(ws, min_col=2, min_row=pie_labels_row, max_row=pie_labels_row + 2)
pie.add_data(pdata)
pie.set_categories(pcats)
pie.height = 8
pie.width = 10
ws.add_chart(pie, "E29")

for sheet in wb.worksheets:
    sheet.sheet_view.zoomScale = 100

out_path = "/home/user/habit-tracker/digital-products/freelancer-finance-hub/Freelance-Finance-Hub.xlsx"
wb.save(out_path)
print("saved", out_path)
