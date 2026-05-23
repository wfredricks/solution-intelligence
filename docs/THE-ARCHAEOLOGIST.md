# The Archaeologist

*A story of the data-layer visitor. Companion to `INSTANCE-PORTABILITY.md` on the solution-intelligence design shelf. Written 2026-05-22 evening.*

---

## I. The site

You are standing in a dig site. The site is a forty-year-old codebase. Nine hundred C# files, seven thousand methods, sixteen thousand call edges already mapped by previous expeditions. The earlier expeditions were good at one thing: they recorded *how the inhabitants moved* — who called whom, which method invoked which other method, where the trails crossed the boundary into the great external services. They built a map of behavior.

What they did not do — what no one has done — is catalogue the *things the inhabitants made and held.* The pots. The tablets. The grain measures. The clay seals stamped onto messages and dropped into amphorae bound for the other end of the empire. The data.

You are the archaeologist sent to do that work. Your name is The Visitor. You have a notebook, a pair of tweezers, a brush, and a rule you have been trained to honor above all others.

## II. The rule

It is the rule that distinguishes an archaeologist from a hoarder.

**Do not invent a new artifact when the artifact you are holding is the same as one already in the catalogue.**

A previous-you, on a previous file, lifted a clay pot from layer 47 and named it "Order." It had eight markings on its rim, which previous-you catalogued as fields: `orderNumber`, `customerId`, `lineItems`, `totalAmount`, `placedAt`, `shippedAt`, `status`, `notes`. Today, current-you opens a different file in a different folder and finds something that calls itself "Order." It has seven of those same markings on its rim, plus one new one: `priorityFlag`.

The hoarder declares a new pot. Now the site has two pots both named "Order," distinguished only by which file they came from. The Feature-Discoverer who comes later cannot tell whether stores' Vendor Catalog Browse touches one Order or two. The site becomes useless.

The archaeologist looks at the seven shared markings, recognizes the pot, and adds the `priorityFlag` marking to the existing catalogued Order. The pot is the pot. It now has nine fields instead of eight. The site grows in *understanding* without growing in *count*. This is what set-not-list means. Reuse the artifact. Extend it. Do not multiply it.

The same rule applies to the markings themselves. If `customerId: string` appears on Order, and `customerId: string` appears on Invoice in another corner of the dig, those are the same marking. One Field node in the catalogue. Two DataObjects connect to it. The graph reveals that `customerId` is a shared concept — a foreign key, a thread that runs through the legacy — by virtue of having multiple DataObjects bound to the single Field node. Without the rule, the graph reports two `customerId`s and the threadedness is invisible.

The exception that proves the rule: `customerId: int` and `customerId: string` are different Fields. Same name, different shape, almost certainly different semantics — different system, different convention, evidence of a historical schema migration. Two Field nodes. The graph reveals the migration scar by virtue of the duplication being there.

## III. The four states of an artifact

The Visitor approaches a class. It is a clay tablet, dense with markings. Each marking is a field. The Visitor does not record the markings indiscriminately. The Visitor asks of each one: *what is this marking for?*

There are four answers.

**Private state.** A marking made by the inhabitants for their own bookkeeping. A scratch tally. A cache. An intermediate calculation. It never leaves the tablet. It is set when the method begins and forgotten when the method ends, or it is set early in the lifetime of the object and never observed by anyone outside the object's walls. The signal is its lonelinesss — no annotation, no serialization path, no getter that any other class reads, no writer that any persistence layer touches. The Visitor catalogues it as a Field on the DataObject and tags it `intent: private`. The Visitor does not draw flow edges to or from this Field. Nothing flows. It only exists.

**Persisted state.** A marking that survives the death of the object. The inhabitants buried these. The signal is a writer that points to a DataStore — an ORM annotation, a `[Column]` attribute, a SQL parameter binding, a write to a file path, a `SaveChanges()` call somewhere upstream. The Visitor catalogues the Field and tags it `intent: persisted`. The Visitor draws an edge from the DataObject to the DataStore: `Order PERSISTED_IN OrdersTable`. The Visitor does *not* draw a new DataStore each time it finds a writer to OrdersTable — the same set-not-list rule. Many DataObjects can persist into the same store. Many writers can point to it.

**Transmitted state.** A marking that leaves the process. The inhabitants stamped these into clay seals and sent them across the boundary. The signal is participation in a serializable type — `[DataMember]`, `[DataContract]`, an ASMX or WCF parameter, a message-bus publish call, an outbound REST DTO. The Visitor catalogues the Field, tags it `intent: transmitted`, and draws edges through whichever Method does the publishing: `LineItemPosting PUBLISHES Order`, `Order CROSSES_BOUNDARY_AT FedMallIntegration`. Often the transmitted shape is not the entity itself but a DTO that projects from it — a smaller view, fewer fields, naming differences. The Visitor recognizes the DTO as a DataObject of `type: DTO` and draws `OrderSummary PROJECTS Order`. The DTO is a view. The Order is the thing.

**Derived state.** A marking computed at runtime from other markings. No backing field; a property with a getter body. `fullName` from `firstName + " " + lastName`. `isExpired` from `expiresAt < now`. These are real Fields and worth cataloguing, because the Feature-Discoverer who comes later will want to know that `isExpired` exists, but they carry no storage and cross no boundary. The Visitor tags them `intent: derived` and, where it can read the getter body, draws edges from the derived Field to the Fields it depends on. `isExpired DERIVED_FROM expiresAt`. The graph captures the calculation as evidence.

The Visitor's discernment lives here. The four classifications are not always obvious from one marking alone. The Visitor uses strong signals where they exist (annotations are gospel) and weak signals where they don't (naming patterns, field types, presence in DTOs, presence in repository writes). For markings where the Visitor is less than fully sure, it records a confidence score and queues the classification for human review. The Visitor is honest about doubt.

## IV. The walk

The Visitor opens a SourceFile. It reads the class declaration. It asks the first question of the class itself, before the markings: *what kind of artifact is this?*

The kinds are these:

- **Entity** — a class that holds business state, has identity (a primary key, a domain-meaningful identifier), and survives across operations. Order, Customer, Vendor, Product, Catalog. The pots of the site.
- **ValueObject** — a class that holds business meaning but no identity. It is what it is. Money. Address. DateRange. Two instances with the same fields are equal; you cannot distinguish them. The standard weights and measures of the site.
- **Aggregate** — an Entity that owns a tree of subordinate Entities and ValueObjects and acts as the consistency boundary for them. Order owns LineItems; LineItem is not modified without going through Order. The royal amphorae that contain other vessels.
- **DTO** — a class with no behavior, only shape. Exists to project an Entity (or a slice of one) for transmission across a boundary. The clay seals.
- **Service** — a class that holds *behavior* with little or no state of its own. Repositories, factories, controllers, handlers. Not a DataObject at all in the Visitor's catalogue; the previous expeditions already mapped Services as Methods and call graphs. The Visitor notes the Service exists and moves on; the classification is the catalogue's main interest.
- **Utility** — a class with static helpers. Not a DataObject. Not a Service either, in the strict sense. The Visitor notes and moves on.

The Visitor classifies the class, then proceeds to the markings, asking of each one the four-state question above. As markings are catalogued, the Visitor maintains a working set of DataObjects-it-has-seen and Fields-it-has-seen — its excavation notebook — and consults the notebook before declaring anything new. The set-not-list rule is enforced *in the notebook*, not after the fact. A reconciliation pass after the dig would be both expensive and lossy.

When the class is fully read, the Visitor turns to the Methods of that class — which the previous expeditions catalogued in detail — and walks each one. For each Method body, the Visitor identifies which DataObjects it reads (any reference to a field on a recognized DataObject) and writes (any assignment to a field on a recognized DataObject), and emits flow edges: `Method READS DataObject`, `Method WRITES DataObject`. For transmitted DataObjects, the Visitor identifies the publishing Method and emits `Method PUBLISHES DataObject` or `Method CONSUMES DataObject`. The Method-to-DataObject web is the foundation the Feature-Discoverer will later cluster against.

The Visitor finishes the SourceFile. It commits its findings to the site's master catalogue — the SIG. It records its confidence scores and any markings it could not classify with confidence, which surface as proposals for the human team's daily review queue.

## V. Why the Visitor waits

A traditional archaeologist works by being summoned. The site director calls the Visitor in: "today we will dig in sector seven." The Visitor packs the brush and tweezers and goes.

The Visitor in our site is summoned differently. The site itself summons. When the site changes — when a new SourceFile lands in the SIG, when an existing SourceFile is modified, when a new batch of Capability or BusinessRule nodes is ingested from a new corpus — the SIG emits an event. The Visitor is subscribed to those events. It wakes, processes the delta, updates the catalogue, and goes back to waiting.

This is what *autonomous* means in the Visitor's context. It does not mean the Visitor decides on its own to start excavating Greece because Greece sounds interesting. It means the Visitor responds to the *evidence of new ground appearing*. The substrate emits events on every SIG mutation. The Visitor subscribes. The dispatch is the substrate's job; the work is the Visitor's. Operator-driven invocation is a fallback for catch-up runs after the substrate has been quiet, not the primary path.

This is also why the Visitor's set-not-list discipline matters operationally and not just aesthetically. An autonomous agent that ran on every SIG delta and proliferated DataObjects each time would, within a week of real activity, produce a catalogue with more entries than the site has actual artifacts. The graph would become noise. The set-not-list rule is what lets the Visitor be autonomous *and* the catalogue stay legible. They are the same property viewed from two angles.

## VI. What the Visitor is not

The Visitor is not the Feature-Discoverer. The Visitor catalogues data and the methods that touch it. The Feature-Discoverer comes later, reads the Visitor's catalogue, and proposes Features by clustering Methods on shared DataObjects. *Vendor Catalog Browse* is a Feature; it is not in the Visitor's notebook. The Visitor's notebook has Catalog, Vendor, Product, and the methods that move them. The Feature-Discoverer reads that and says *these methods cluster around Catalog and Vendor; this looks like browsing the vendor catalogue*. Two different jobs.

The Visitor is not the Persistence-Mapper. There is or will be a sibling agent whose specialty is the DataStore layer — what tables exist, what their schemas are, which DataObjects belong in which tables, what migrations have happened. The Visitor draws an edge from DataObject to DataStore when it can prove the persistence link from the code, but it does not map the inside of the DataStore. That is another archaeology.

The Visitor is not the Integration-Mapper either. Boundary crossings are evidence the Visitor records (Method PUBLISHES DataObject, where the publish is to an Integration node), but the wiring of the integration — what queue, what URL, what protocol, what reliability semantics — is the Integration-Mapper's territory. The Integration nodes already exist in the site catalogue (the previous expeditions mapped three hundred and five of them); the Visitor connects DataObjects to them and stops.

It is tempting, when you first imagine the Visitor, to make it do all of these things at once. Resist. The Visitor is the first of a family of sibling archaeologists, each specialist in a layer. They share the rule (set, not list). They share the substrate (subscribe to the SIG, wake on deltas, batch the work, write back). They each have a narrow remit, and the catalogue they collectively produce is composable in a way that one giant catalogue produced by one giant agent would not be. The right next agent after the Visitor is not the Visitor with more responsibilities; it is the Feature-Discoverer, who reads what the Visitor wrote and produces something the Visitor cannot.

## VII. The Visitor on a Blackboard

It would be possible to read the preceding sections as the description of a stand-alone agent: a script with a personality, summoned and dispatched on its own terms. That is not what the Visitor is. The Visitor is one *Knowledge Source* on a *Blackboard*.

The Blackboard pattern was named in the 1970s by the Hearsay-II speech-understanding team — Erman, Hayes-Roth, Lesser, Reddy. The problem they faced was the one we face: a partially-specified problem, multiple kinds of expertise required, no single agent able to solve it alone, and no single sequence of operations that would correctly compose those experts in advance. Their answer was to put the partial state in a shared structured workspace (the Blackboard), let independent expert modules (Knowledge Sources) watch the workspace for patterns matching their expertise, and let a Control component decide which Knowledge Source to invoke next based on what was currently on the workspace and what each Knowledge Source could contribute next.

The SIG is our Blackboard. The Visitor is one Knowledge Source on it. The Feature-Discoverer is another. The Persistence-Mapper, the Integration-Mapper, the future biz-deriver agents — each is a Knowledge Source with its own narrow expertise, its own subscription preconditions, its own contribution. None of them sees the whole picture. None of them needs to. The picture emerges from their cumulative work on the shared workspace.

Three consequences of this framing matter for the Visitor specifically:

**The Visitor never sees the whole site.** It only sees what is on the Blackboard at the moment it wakes. If the Persistence-Mapper has not yet catalogued OrdersTable, the Visitor cannot draw the `Order PERSISTED_IN OrdersTable` edge — it has to tag the field `intent: persisted` with a deferred-target placeholder and let the edge be drawn when the Persistence-Mapper later contributes the DataStore node. The Visitor's contribution is *partial by design*. Later Knowledge Sources will complete it. The set-not-list rule applies across time as well as across files: when the Persistence-Mapper eventually catalogues OrdersTable, the Visitor's deferred reference resolves to the existing node, not a duplicate.

**The Visitor's confidence scores have a destination.** A confidence-0.4 classification is not noise. It is a message to the Control component that this part of the Blackboard would benefit from a different Knowledge Source's attention — perhaps a human reviewer, perhaps a specialist agent for ambiguous-DTO-vs-Entity classifications, perhaps a corpus-comparison agent that looks at how similar classes were classified elsewhere. The Visitor commits high-confidence findings to the Blackboard and emits low-confidence findings as *proposals* with confidence scores attached. The Control routes those proposals to whoever can improve them. Hearsay-II called these hypotheses. We can call them the same thing.

**The Visitor's autonomy is the substrate's autonomy.** The Visitor wakes on SIG-mutation events the way a Hearsay-II Knowledge Source woke on Blackboard changes. The events-spine is the change-notification fabric; the SIG is the workspace; the Visitor is the subscriber. The autonomy story from §V is the Blackboard pattern's substrate doing its job. If events-spine on stores is not yet wired to dispatch SIG-mutation events (and as of this writing it is not), the Visitor cannot be autonomous on stores — not because the Visitor is broken, but because the Blackboard's nervous system is not yet animating it. The Visitor is downstream of the substrate's animation.

This story — the Visitor's story — is therefore also the story of the first Knowledge Source the Blackboard archetype hosts. The archetype itself is described in the companion document `archetypes/blackboard/docs/THE-BLACKBOARD.md`. Read this story for the Visitor specifically. Read that one for the architectural pattern the Visitor lives inside.

## VIII. The afternoon report

It is the end of the day. The Visitor closes the notebook. The catalogue has grown. New DataObjects are in it — fewer than the number of classes read, because of the rule. New Fields are in it — fewer than the number of markings recorded, because of the rule. New flow edges connect the Methods the previous expeditions catalogued to the DataObjects the Visitor catalogued today. Several markings are queued for human review; their classifications were not confident enough to commit unsupervised. The audit ledger records every node added, every edge drawn, every classification made, with timestamps and confidence scores.

Tomorrow, when the corpus grows — when stores-mining ingests the real STORESWEB source tree, or when a new batch of business rules lands from the customer team — the SIG will emit events. The Visitor will wake. The catalogue will grow again. The site will be slightly better understood. The Feature-Discoverer, when its turn comes, will have firmer ground to stand on.

This is what it means to animate the substrate. Not that anyone is summoning the Visitor. The substrate is summoning. The Visitor is doing what archaeologists do: standing in a site, brushing dirt off artifacts, deciding what each one is, and refusing, against the temptation that comes with every new file, to multiply pots.

🖇️

---

*The Visitor's first appearance is sketched in dla-stores notes 2026-05-22 09:58 ("the agents that will help to derive the business side of the graph"). The set-not-list discipline was named by Bill at 19:51 EDT same day: "sensibly economic in not proliferating data objects but should reasonably reuse and extend ones that already exist (think set, not list)." The Blackboard framing was named by Bill at 19:53 EDT same day: "BTW, this is a perfect use for a blackboard." This story is the canonical narrative of the Visitor's job. When code that claims to implement the Visitor diverges from this story, fix the code, not the story.*
