# Client Decisions Needed

These answers are required before implementing the next business modules. They are intentionally separate from technical implementation because each answer changes database fields, workflows, and UI contracts.

## Public pricing calculator

1. What currency should prices use, and should tax be included or shown separately?
2. What worker-count bands and base prices should be configured?
3. Should industry change the price? If yes, provide the multiplier or surcharge for each industry.
4. Which states and cities should be available, and what multiplier/city fee applies to each?
5. What is included in every service and package, and can customers combine packages with individual services?
6. How long should a quotation remain valid?
7. Should a visitor be required to submit name, email, phone, and company details before receiving a quotation?

## Quotation lifecycle

1. Who can move a quotation from Draft to Sent, Under Review, and Accepted?
2. Does customer acceptance automatically create a subscription and invoice?
3. Can staff edit a quotation after it has been sent?
4. Should an accepted quotation require an expiry date or manual admin approval?

## Subscriptions

1. What subscription plans and billing periods are offered?
2. Is renewal automatic or manual?
3. What happens when a customer cancels: immediate cancellation or end-of-period cancellation?
4. Are upgrades, downgrades, pauses, or prorated charges required?

## Invoices and payments

1. Which payment gateway will be used in the client's region?
2. What currency and payment methods are required?
3. Should invoices be generated automatically from accepted quotations/subscriptions?
4. Who can manually mark an invoice as paid, and is an audit note required?
5. What refund and failed-payment behavior is required?

## Notifications and email automation

1. Which email provider and verified sender address should be used?
2. Which roles receive each notification category?
3. Should customers receive notifications by email, in-app feed, or both?
4. What branding, language, and support contact should appear in email templates?
5. How many reminder emails should be sent before document, quotation, or subscription expiry?

## Manager assignments and oversight

1. Can one customer be assigned to multiple agents?
2. Can agents see only assigned customers, or all customers in a branch/team?
3. Which role can assign, reassign, and remove assignments?
4. Which workload metrics and reports are required for managers?

## Document collection and review

1. What document categories are required?
2. What file types and maximum file size should be accepted?
3. Which documents require an expiry date?
4. Are rejection notes mandatory?