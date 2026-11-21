"""Build the iOS Shortcuts that send Apple Health data to the app.

usage: python3 -I scripts/build_shortcut.py <base_url> <out.unsigned.shortcut> [--run]
  default: daily metrics → /api/ingest/daily   (sign to public/shortcut/running-journal.shortcut)
  --run:   latest run    → /api/ingest/run     (sign to public/shortcut/running-journal-run.shortcut)
then:  shortcuts sign --mode anyone --input <out.unsigned.shortcut> --output public/shortcut/<name>.shortcut

The secret token is NOT stored in the file: an import question asks for it when the shortcut is added.
"""
import plistlib, sys, uuid

base, out = sys.argv[1].rstrip("/"), sys.argv[2]
OBJ = "￼"  # placeholder char where a variable is inserted in a text token


def uid():
    return str(uuid.uuid4()).upper()


def text(s):
    return {"Value": {"string": s, "attachmentsByRange": {}}, "WFSerializationType": "WFTextTokenString"}


def var_text(output_uuid, output_name, prop=None, iso_date=False, prefix=""):
    agg = []
    if prop:
        agg.append({"Type": "WFPropertyVariableAggrandizement", "PropertyName": prop})
    if iso_date:
        agg.append({"Type": "WFDateFormatVariableAggrandizement", "WFDateFormatStyle": "ISO 8601", "WFISO8601IncludeTime": True})
    att = {"OutputUUID": output_uuid, "OutputName": output_name, "Type": "ActionOutput"}
    if agg:
        att["Aggrandizements"] = agg
    return {"Value": {"string": prefix + OBJ, "attachmentsByRange": {f"{{{len(prefix)}, 1}}": att}},
            "WFSerializationType": "WFTextTokenString"}


def dict_field(items):
    return {"Value": {"WFDictionaryFieldValueItems": [{"WFItemType": 0, "WFKey": text(k), "WFValue": v} for k, v in items]},
            "WFSerializationType": "WFDictionaryFieldValue"}


def find_health(type_name, sort_latest, limit=None, last_days=None, last_hours=None):
    u = uid()
    templates = [{"Operator": 4, "Property": "Type", "Removable": False,
                  "Values": {"Enumeration": {"Value": type_name, "WFSerializationType": "WFStringSubstitutableState"}}}]
    if last_days or last_hours:  # "is in the last N days/hours" (NSCalendarUnit: day = 16, hour = 32)
        templates.append({"Operator": 1001, "Property": "Start Date", "Removable": True,
                          "Values": {"Number": last_days or last_hours, "Unit": 16 if last_days else 32}})
    params = {
        "UUID": u,
        "WFContentItemFilter": {"Value": {"WFActionParameterFilterPrefix": 1, "WFContentPredicateBoundedDate": False,
                                          "WFActionParameterFilterTemplates": templates},
                                "WFSerializationType": "WFContentPredicateTableTemplate"},
        "WFContentItemSortProperty": "Start Date",
        "WFContentItemSortOrder": "Latest First" if sort_latest else "Oldest First",
    }
    if limit:
        params["WFContentItemLimitEnabled"] = True
        params["WFContentItemLimitNumber"] = limit
    return u, {"WFWorkflowActionIdentifier": "is.workflow.actions.filter.health.quantity", "WFWorkflowActionParameters": params}


def post_and_notify(path, fields):
    url_u = uid()
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": {
            "UUID": url_u,
            "WFURL": f"{base}{path}",
            "WFHTTPMethod": "POST",
            "ShowHeaders": True,
            "WFHTTPHeaders": dict_field([("Authorization", var_text(token_u, "Text", prefix="Bearer "))]),
            "WFHTTPBodyType": "JSON",
            "WFJSONValues": dict_field(fields),
        },
    })
    val_u = uid()
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
        "WFWorkflowActionParameters": {
            "UUID": val_u,
            "WFGetDictionaryValueType": "Value",
            "WFDictionaryKey": "message",
            "WFInput": {"Value": {"OutputUUID": url_u, "OutputName": "Contents of URL", "Type": "ActionOutput"},
                        "WFSerializationType": "WFTextTokenAttachment"},
        },
    })
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.notification",
        "WFWorkflowActionParameters": {
            "WFNotificationActionTitle": "Running Journal",
            "WFNotificationActionBody": var_text(val_u, "Dictionary Value"),
            "WFNotificationActionSound": False,
        },
    })


HS = "Health Samples"
RUN = "--run" in sys.argv
token_u = uid()
actions = [{
    "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
    "WFWorkflowActionParameters": {"UUID": token_u, "WFTextActionText": "วางรหัสลับที่นี่"},
}]
if RUN:
    actions.append({"WFWorkflowActionIdentifier": "is.workflow.actions.comment", "WFWorkflowActionParameters": {
        "WFCommentActionText": "Running Journal: ส่งการวิ่งล่าสุด (ระยะ, หัวใจ, แคลอรี่, ก้าว ใน 3 ชม.ล่าสุด) ไปที่เว็บแอป — ตั้ง Automation: Apple Watch Workout → Running → Ends → Run Immediately หรือกดเองหลังวิ่ง"}})
    # give the Watch a moment to hand the workout samples to the iPhone when run by the automation
    actions.append({"WFWorkflowActionIdentifier": "is.workflow.actions.delay", "WFWorkflowActionParameters": {"WFDelayTime": 20}})
    a, act = find_health("Walking + Running Distance", False, last_hours=3); actions.append(act)
    b, act = find_health("Heart Rate", False, last_hours=3); actions.append(act)
    c, act = find_health("Active Energy", False, last_hours=3); actions.append(act)
    d, act = find_health("Steps", False, last_hours=3); actions.append(act)  # cadence (Watch writes one every ~2.5 s in a workout)
    post_and_notify("/api/ingest/run", [
        ("dist_value", var_text(a, HS, "Value")),
        ("dist_start", var_text(a, HS, "Start Date", iso_date=True)),
        ("dist_end", var_text(a, HS, "End Date", iso_date=True)),
        ("dist_source", var_text(a, HS, "Source")),
        ("hr_value", var_text(b, HS, "Value")),
        ("hr_start", var_text(b, HS, "Start Date", iso_date=True)),
        ("kcal_value", var_text(c, HS, "Value")),
        ("kcal_start", var_text(c, HS, "Start Date", iso_date=True)),
        ("step_value", var_text(d, HS, "Value")),
        ("step_start", var_text(d, HS, "Start Date", iso_date=True)),
        ("step_end", var_text(d, HS, "End Date", iso_date=True)),
        ("step_source", var_text(d, HS, "Source")),
    ])
else:
    actions.append({"WFWorkflowActionIdentifier": "is.workflow.actions.comment", "WFWorkflowActionParameters": {
        "WFCommentActionText": "Running Journal: ส่ง HR พัก, HRV, การนอน, VO2max และหัวใจระหว่างนอน ไปที่เว็บแอปทุกเช้า (ตั้ง Automation: Alarm → Is Stopped → Run Immediately)"}})
    a, act = find_health("Resting Heart Rate", True, limit=1, last_days=7); actions.append(act)
    b, act = find_health("Heart Rate Variability", True, last_days=1); actions.append(act)
    c, act = find_health("Sleep", False, last_days=1); actions.append(act)  # "Sleep Analysis" does not resolve on iOS 26
    d, act = find_health("Cardio Fitness", True, limit=1, last_days=7); actions.append(act)  # VO2 max is "Cardio Fitness" in Health
    e, act = find_health("Heart Rate", False, last_hours=14); actions.append(act)  # sleeping HR for the night view
    post_and_notify("/api/ingest/daily", [
        ("rhr", var_text(a, HS, "Value")),
        ("rhr_date", var_text(a, HS, "Start Date", iso_date=True)),
        ("hrv", var_text(b, HS, "Value")),
        ("sleep_value", var_text(c, HS, "Value")),
        ("sleep_start", var_text(c, HS, "Start Date", iso_date=True)),
        ("sleep_end", var_text(c, HS, "End Date", iso_date=True)),
        ("sleep_source", var_text(c, HS, "Source")),
        ("vo2", var_text(d, HS, "Value")),
        ("vo2_date", var_text(d, HS, "Start Date", iso_date=True)),
        ("hr_value", var_text(e, HS, "Value")),
        ("hr_start", var_text(e, HS, "Start Date", iso_date=True)),
    ])

workflow = {
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowClientVersion": "2605.0.5",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4251333119 if RUN else 4292093695, "WFWorkflowIconGlyphNumber": 59511},
    "WFWorkflowTypes": [],
    "WFWorkflowInputContentItemClasses": [],
    "WFWorkflowHasOutputFallback": False,
    "WFWorkflowHasShortcutInputVariables": False,
    "WFQuickActionSurfaces": [],
    "WFWorkflowImportQuestions": [{
        "ActionIndex": 0,
        "Category": "Parameter",
        "ParameterKey": "WFTextActionText",
        "Text": "วางรหัสลับ (จากไฟล์ .secrets/ingest-token.txt บน Mac)",
        "DefaultValue": "",
    }],
    "WFWorkflowActions": actions,
}
with open(out, "wb") as f:
    plistlib.dump(workflow, f, fmt=plistlib.FMT_BINARY)
print("wrote", out, len(actions), "actions")
