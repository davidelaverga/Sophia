# Sophia, from an idea to a project that keeps moving

**Human guide · v0.3 Part 1 · 24 September 2026**

## The product we are building

Sophia is a cooperative guide for people creating something together. She helps a team understand an idea, make it visible, decide what to build, coordinate the work, review the result, and carry what was learned into the next cycle.

The first team is Davide and Luis. They bring different strengths and three existing engineering resources: Davide's Codex, Davide's Claude Code and Luis's Claude Code. Sophia gives those resources a shared project context and lets the people direct the result from one place. She does not turn their accounts into a shared credential pool.

The product is not a project-management dashboard with a chatbot attached. Its center is the conversation and the work: a prototype, a running application, a document, a presentation or a consequential decision. The roadmap, execution details and evidence support that experience rather than replacing it. [P-01]

## A real day with Sophia

You start by saying, “We already have some thinking in ChatGPT and some implementation in Claude Code. Let's continue the welcome experience here.” You select the relevant exported conversations, instructions, source files or handoff, and link the correct repository and owner-operated engineer sessions. Sophia shows the material she received and the missing pieces. She proposes a short account of the current direction; you correct what the old conversations no longer describe.

You and Luis join the same workspace. You can talk to one another and to Sophia. In the first release, Sophia receives the admitted speaker's audio during an explicitly opened exchange. Both people hear her answer. Passing the speaking/input role does not pass the right to approve the other person's account. A later release adds a clearly enabled mode in which Sophia follows the team's discussion.

You ask for two visual directions. Google or OpenAI image generation produces versioned visual assets, but the design does not remain a picture. Sophia's native creative worker turns the selected direction into runnable UI source. Luis opens Preview, Source or Diff, changes the frontend, and sees a new candidate. The prototype states where its data and services are simulated.

The technical lead now has something much better than “build a website like this screenshot.” It receives the actual components, images, tokens, interaction states, accepted decisions, missing services and checks. It proposes a small sequence of goals, and you authorize the first one.

For that goal, the lead can make Codex the coordinator and assign two independent implementation areas to the two Claude Code resources. Or it can use one engineer and reserve a different resource for review. The allocation follows the work's dependencies, ownership and resource allowance; the system does not keep three models talking merely because three are available.

The peers exchange concrete questions, partial findings and handbacks through software. They do not open each other's desktop windows. Sophia's technical lead periodically checks the project and can be called immediately through **Review work progress**. It distinguishes a real permission wait from a quiet but productive diagnosis, and explains a material steer or replan.

A permission request from Luis's Claude Code appears in Sophia with the resource, native session, requested action and owner. In the first release Luis opens the indicated native tool and responds there. Sophia observes the actual resolution. In the next release supported permissions can be answered from Sophia on desktop or mobile.

The engineers return a working application preview. You look at it with Sophia and say, “Make this secondary action easier to find, but keep the primary action and the overall layout.” Sophia binds that instruction to the preview you actually saw, and the lead hands the change and preservation requirements to the right worker. The previous useful preview remains available while a new candidate is checked.

When the goal closes, the project retains the result, the evidence, the decisions and the remaining disagreements. A useful learning enters the next relevant brief. It is not automatically treated as everyone's permanent taste, and it is not a reason to change the mission after every ordinary bug.

## One experience, three lenses

**Converse** is shared thinking, questions and reflection. It can be useful before there is a formal goal. It also explains why a decision was made and helps the team reconsider it.

**Explore** makes alternatives concrete. It includes technical research, visual directions and runnable behavioral experiments. A runnable prototype may still be exploratory; a screenshot may be implementation evidence. File type does not decide the lens.

**Build** presents admitted creation and implementation, the preview, source changes, checks and relevant work controls. It does not mean that every visible candidate is accepted or deployed.

These are views over the same project. Switching a view does not start or stop work, change who may see a private source, or rewrite the engineer's brief. One person can inspect a reference while another stays on the application. Following shared focus is deliberate. [P-01, P-02]

## The people and agents behind the experience

```text
Davide and Luis
    ↕ voice, text, selected work, decisions
Sophia — one cooperative guide
    ↕ project questions and consequential work requests
Project technical lead
    ↕ roadmap, assignments, evaluation and replanning
A goal's working arrangement
    solo engineer | coordinator + workers | separate reviewer
    ↕ candidate, source, questions and evidence
Shared project memory and the next useful step
```

The technical lead and a goal coordinator are different responsibilities. The lead decides how the whole project should progress within the team's mandate. The coordinator solves the assigned goal. A worker can question the coordinator, but neither can silently change the team's product promise or grant itself more access.

Sophia can answer an ordinary conversational question without invoking that whole hierarchy. The first voice implementation uses Gemini 3.8 Live as a real conversational model, not merely as a text-to-speech device reading another model's every sentence. It consults the project's tools and delegates long work where needed. dsh hosts the text guide, technical lead and native workers. Both conversational routes share accepted project context and the same action contracts.

## What DeepSeek Harness contributes

DeepSeek Harness is the extensible runtime for Sophia-owned agent work. Its Cordis plugins provide the loop, tools, model routes, session history, context handling and other mechanisms. We start it through its supported `dsh` launcher and a named Sophia profile; we do not fork the loop or insert the old Sophia middleware chain into it. [DSH-02, DSH-03]

The ordinary Sophia backend supplies what a team product needs above a local agent runtime: authenticated members, accepted goals, source versions, action ownership, durable jobs and a recoverable view of work. A dsh session is not a user account, a room or the final judge of project completion.

A new Sophia runtime bridge connects those two layers. This is necessary because the inspected stock SDK has no mid-turn cancel operation, while the public in-process Agent interface has the lifecycle controls we need. The bridge is a Cordis plugin in the supported application composition, not a second model loop. [DSH-06–DSH-10]

## Voice, sight and creation

**Voice:** Gemini `gemini-3.8-live`, through Google's API. LiveKit carries the room's audio and participant identity. A Sophia media bridge sends only the admitted input to Google and returns one shared Sophia audio track. It owns reconnection, stale-output suppression and the relationship between audio and current project state.

**Sight:** selected screen or artifact frames enter the Live exchange. Exact words, values and source locations are retrieved separately when precision matters. A screenshot helps Sophia understand appearance; it is not permission to edit or proof that an application works.

**Images:** the initial default is Google's `gemini-3.1-flash-image`; the principal OpenAI comparator is `gpt-image-2.5-sunburst-2026-09-08`. Google Pro and OpenAI Flare are explicit selectable comparison candidates. A comparison is an intentional job, not an automatic charge to every vendor on every prompt. Images are retained as assets and reused in the actual frontend and deck source. [G-01, G-07, OA-01, OA-02]

**Native work:** DeepSeek V4.1 Flash is invoked through the official `deepseek-flash` route for research, native creative source and routine project work. A stronger effort or an external frontier reviewer is selected where useful, rather than paying for a frontier model to perform every routine step. Model labels do not prove competence; accepted outcomes and resource records guide later changes. [DS-01, DSH-14]

## What you will see while work runs

A compact Work Pulse reports current activity and the last verified observation. Required Human Actions identify what is needed and from whom. Cooperation Opportunities invite useful human judgment without stopping independent work. Persistent controls remain available regardless of whether Sophia notices an opportunity. An Inspector opens the deeper source, messages and evidence.

Sophia's periodic review is deliberately simple initially: one coalesced review every five minutes while relevant work is active, important event-triggered reviews and a manual review action. The lead may continue, investigate, steer, prepare a better alignment brief or propose replanning. Significant choices are visible and steerable; a routine “continue” need not interrupt the conversation.

The distinction between **sent**, **received**, **incorporated** and **checked** remains visible when it matters. A provider's “done” is a claim to evaluate, not proof that the team's goal is achieved.

## What memory means here

Current accepted decisions are read directly. They are not rediscovered by a similarity search. Sources and past discussions help explain them. Project knowledge summarizes useful understanding with provenance and freshness. Lessons guide later work within their scope. Personal material remains separate until its owner releases the exact contribution.

Imports preserve source, author and uncertainty. An exported model answer is not an accepted requirement merely because it is well written. Correction or removal must affect future prompts, not just hide an item from the interface. Memories and external session transcripts are not interchangeable authorities. [P-01]

## The three complete releases

**Sprint 1: create, coordinate and steer together.** Two people use voice and the shared Studio; Sophia creates research, images, documents and real UI prototypes; all three owner-bound engineers perform actual work; progress, permissions and lead decisions are visible; co-review sends a precise change/preserve brief; a working application is reviewed in the app. Existing engineer deployments are used; first-party Notion/Supabase/Vercel management connectors are not prerequisites.

**Sprint 2: precise cooperation and remote control.** The product adds richer attention dynamics, reviewable milestones, consented discussion-following, exact supported artifact edits, scenario and browser tests, supported in-app approvals and mobile steering. Unavailable native login or OS dialogs remain honestly native operations.

**Sprint 3: continuity that compounds.** Sophia can sustain authorized multi-week work, adapt the working arrangement, deliver a supported native full-stack application feature and improve procedures from evidence. An external team uses the product repeatedly, including a member without a coding subscription.

The milestones inside each sprint are usable vertical increments. A sprint is a product release, not a promise that an ambitious release takes ten days. The first integration should already let voice launch real work and show a real result.

## What we keep, and what we replace

We keep the useful design language, artifact knowledge, source/version lessons, voice test cases and memory guarantees of current Sophia. We replace its ordering-sensitive companion assembly and interrupt-based work semantics. Selected Python renderers can remain isolated jobs while the new product core is TypeScript. We do not carry old orchestration merely to reuse a format converter. [P-01, OLD-01–OLD-03]

This documentation installment supplies the whole system map and the deeper runtime/media/image design. The next installment completes the low-level three-engineer API bindings, database migrations and detailed UI/rendering mission specifications. That boundary is explicit so the first agents can begin real work without treating uninspected interfaces as facts.
