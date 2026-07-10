// app/api/chatbot/extract/route.ts
//
// Two modes, both stateless (same philosophy as our JWT auth — the
// server never remembers anything between requests on its own):
//
// Mode A — a fresh message (no expectedField): full extraction +
// resolution, same as before. If it's a create missing required fields,
// we don't dump the whole list — we return just the FIRST missing field
// to ask about.
//
// Mode B — expectedField is set: the client is answering ONE specific
// question. We run a tiny, targeted extraction for just that field,
// validate it with real rules, and either move to the next missing
// field or finish.

import { NextRequest, NextResponse } from "next/server";
import { extractEmployeeData, extractSingleField, type ChatTurn } from "@/lib/gemini";
import { resolveEmployeeMatches, resolveEmployeeQuery } from "@/lib/chatbotResolve";
import { validateExtractedFields, validateFieldValue } from "@/lib/chatbotValidate";
import { CREATE_REQUIRED_FIELDS } from "@/lib/tabConfig";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/requireAuth";

// Finds the next field to ask about, skipping anything the admin has
// explicitly typed "skip" for. __skipped travels inside `data` itself
// (it's stripped out before anything reaches the confirmation card or
// the database) — simplest way to carry it through a stateless API
// without a separate session store.
function findNextMissingField(data: Record<string, unknown>): string | undefined {
  const skipped = (data.__skipped as string[]) || [];
  return CREATE_REQUIRED_FIELDS.find((f) => !data[f] && !skipped.includes(f));
}

function stripInternal(data: Record<string, unknown>) {
  const { __skipped, ...rest } = data;
  return rest;
}

export async function POST(request: NextRequest) {
  try {
    if (!requireUserId(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { message, existingDraft, expectedField, history, lastEmployee } = await request.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "A message is required." }, { status: 400 });
    }

    // ---- Mode B: answering one specific field ----
    if (expectedField && existingDraft) {
      if (message.trim().toLowerCase() === "skip") {
        const skipped = [...((existingDraft.__skipped as string[]) || []), expectedField];
        const draft = { ...existingDraft, __skipped: skipped };
        const nextField = findNextMissingField(draft);
        if (!nextField) {
          return NextResponse.json({ action: "create", matches: [], data: stripInternal(draft) });
        }
        return NextResponse.json({ action: "needsInfo", field: nextField, data: draft });
      }

      const value = await extractSingleField(expectedField, message);
      if (!value) {
        return NextResponse.json({
          action: "invalidField",
          field: expectedField,
          reason: "I couldn't find that in your reply — please try again, or type \"skip\".",
          data: existingDraft,
        });
      }

      const check = validateFieldValue(expectedField, value);
      if (!check.valid) {
        return NextResponse.json({
          action: "invalidField",
          field: expectedField,
          reason: check.reason,
          data: existingDraft,
        });
      }

      const draft = { ...existingDraft, [expectedField]: check.normalized ?? value };
      const nextField = findNextMissingField(draft);
      if (!nextField) {
        return NextResponse.json({ action: "create", matches: [], data: stripInternal(draft) });
      }
      return NextResponse.json({ action: "needsInfo", field: nextField, data: draft });
    }

    // ---- Mode A: a fresh message ----
    const extracted = await extractEmployeeData(message, (history as ChatTurn[]) || []);

    if (extracted.intent === "delete") {
      return NextResponse.json({
        action: "unsupported",
        message: "Deleting an employee isn't available through chat yet — please use the Records page for that.",
      });
    }

    // Off-topic guard: the system instruction already tells the model to
    // decline anything outside employee-record scope, but we don't trust
    // that alone — if intent came back "unspecified" AND nothing usable
    // was extracted, this is genuinely not an employee-related message.
    // Without this check, an off-topic message would fall through to
    // resolveEmployeeMatches with no name/ID, silently land on "create,"
    // and show a confusing "new employee, no fields found" card.
    if (extracted.intent === "unspecified" && !extracted.fullName && !extracted.identifierHint) {
      return NextResponse.json({
        action: "unsupported",
        message: 'I can only help with creating, updating, or looking up employee records — try something like "Add a new hire..." or "Is there an employee named...".',
      });
    }

    const { intent, identifierHint, ...rawData } = extracted;
    const { cleaned: newData, warnings } = validateExtractedFields(rawData);

    // ---- Read: a lookup question, not a write ----
    if (extracted.intent === "read") {
      const { action: readAction, matches } = await resolveEmployeeQuery(extracted);

      if (readAction === "notFound") {
        return NextResponse.json({ action: "info", found: false });
      }
      if (readAction === "disambiguate") {
        return NextResponse.json({ action: "disambiguateRead", matches, requestedFields: extracted.requestedFields });
      }

      // Exactly one match — fetch their full Basic Info for a real answer,
      // not just the thin id/name/email summary used for matching.
      const employee = await prisma.employee.findUnique({
        where: { id: matches[0].id },
        include: { experience: true, education: true, certificates: true, skills: true },
      });
      return NextResponse.json({
        action: "info",
        found: true,
        employee,
        requestedFields: extracted.requestedFields,
      });
    }

    const { action, matches } = await resolveEmployeeMatches(extracted);

    // A name search can be ambiguous (e.g. two employees who happen to
    // share a name) even when the CONVERSATION isn't — if the admin
    // already picked a specific person earlier in this exchange and
    // that same person is one of the candidates a fresh name search just
    // turned up, re-asking "which one?" is asking a question we already
    // have a confident, deterministic answer to. Resolve straight to
    // them instead. This only short-circuits genuine name collisions;
    // an explicit ID/National ID already resolves to a single match
    // before this point via resolveEmployeeMatches's own identifierHint
    // tier, so it never reaches here.
    if (action === "disambiguate" && lastEmployee?.id) {
      const known = matches.find((m) => m.id === lastEmployee.id);
      if (known) {
        return NextResponse.json({ action: "update", matches: [known], data: newData, warnings });
      }
    }

    // This is the actual fix for "the bot forgets who we're talking
    // about": zero matches used to always mean "make a new employee" —
    // but that's only true when the admin genuinely said so. If intent
    // is anything else (update, delete, unspecified-but-clearly-about-
    // someone) and resolution found nobody, silently defaulting to
    // "create" is exactly the kind of confident-but-wrong guess a real
    // conversation wouldn't make. Ask instead — offering the person we
    // last discussed as a suggestion when we have one, the same way a
    // human would say "you mean Fady Nabil, right?" rather than either
    // silently assuming OR asking a totally open-ended question.
    if (action === "create" && extracted.intent !== "create") {
      if (lastEmployee?.id && lastEmployee?.fullName) {
        return NextResponse.json({
          action: "confirmIdentity",
          suggestedEmployee: lastEmployee,
          data: newData,
          warnings,
        });
      }
      return NextResponse.json({ action: "askIdentity", data: newData, warnings });
    }

    // A genuine "create a new employee" — hand off to the structured form
    // instead of interrogating the admin one field at a time. Whatever
    // Gemini already pulled out of the opening message (newData) rides along
    // as pre-fill, so the admin only fills the gaps. The form itself is the
    // create path now; the old one-by-one needsInfo flow is no longer used
    // for creates.
    if (action === "create") {
      return NextResponse.json({ action: "createForm", data: newData, warnings });
    }

    return NextResponse.json({ action, matches, data: newData, warnings });
  } catch (error) {
    console.error("Chatbot extract error:", error);
    return NextResponse.json(
      { error: "Something went wrong processing that message." },
      { status: 500 }
    );
  }
}