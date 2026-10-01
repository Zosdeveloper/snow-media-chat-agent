/**
 * Knowledge Base for RAG Content
 * Structured content indexed by type and industry for targeted retrieval
 */

const db = require('../database/db');
const embeddingService = require('./embeddingService');

/**
 * Content types for RAG indexing
 */
const CONTENT_TYPES = {
    CASE_STUDY: 'case_study',
    SERVICE: 'service',
    RESOURCE: 'resource',
    FAQ: 'faq',
    OBJECTION: 'objection'
};

/**
 * Seed the knowledge base with structured content
 * Only runs if patterns table is empty (first boot)
 */
async function seedIfEmpty() {
    if (!embeddingService.isAvailable()) {
        console.log('Knowledge base seeding skipped: embeddings not available');
        return;
    }

    const content = [
        // Case studies. Every line below is checked against the live case study
        // page on thesnowmedia.com (channel, timeline, and all three published
        // metrics). When a page changes, change it here: the bot cites these
        // word for word. Titles are the seed keys, so keep a title stable and
        // edit only the context, or the old row is left behind in the database.

        // Lead-gen and local businesses
        ...buildCaseStudies('home_services', [
            { client: 'PlugPV', industry: 'Solar', result: '230% boost in SQLs', context: 'Solar installer for residential and commercial clients. Meta Ads, 90 days: testimonial videos aimed at homeowners in target areas, then retargeting the video viewers with lead campaigns. Also 52% more website traffic and a 36% lower CPL.' },
            { client: 'SPEAR Physical Therapy', industry: 'Healthcare', result: '63% increase in bookings across 50+ locations', context: 'Physical therapy group with 50+ locations in New York and New Jersey. Google Ads, 60 days: a Demand Gen campaign built demand around the underperforming locations. Also 82% more website traffic and a 16% lower CPA.' },
            { client: 'GymTonic', industry: 'Fitness', result: '399% increase in new members', context: 'Premium fitness and wellness center in Los Angeles. Google Ads, 8 months: localized keywords around open gym, group classes, personal training, and wellness services. Also 76% more phone leads, 227% more online leads, and a 25% lower CPL.' },
            { client: 'BMS Moving & Storage', industry: 'Moving', result: '70% uplift in SQLs', context: 'Nationwide moving company with 17+ locations. Google Ads, 30 days: an account audit found broad match keywords inflating costs, so we moved to phrase and exact match for higher-intent searches. Also a 58% lower CPA and a 222% higher conversion rate.' },
            { client: 'Waxxpot', industry: 'Beauty/Wellness', result: '37% increase in online bookings', context: 'Multi-location waxing salon brand. Google Ads, 90 days: Performance Max new-customer campaigns run market by market, testing audiences per location. Also 29% more revenue and a 42% lower CPA.' },
            { client: 'Bitty & Beaus Coffee', industry: 'Restaurant', result: '334% growth in store visits', context: 'Coffee shop brand with 20+ locations. Google Ads, 90 days: Performance Max across all locations using customer match lists, audience signals, and local competitor targeting. Also a 96% decrease in cost and a 114% brand uplift.' },
            { client: 'ClubExec Auto', industry: 'Automotive', result: '18% increase in leads', context: 'Premium car care provider in the Washington D.C. metro area. Google Ads, 90 days: non-branded search for high-ticket services like ceramic coating and paint protection film, with leads checked against the CRM and offline conversion tracking. Also a 10% lower CPA and a 32% higher CTR.' },
            { client: 'HookSounds', industry: 'Entertainment', result: '20% boost in CVR', context: 'Royalty-free music subscription platform. Google Ads, 90 days: moved from branded-only to non-branded campaigns and new markets (Latin America, US, Europe). Also a 16% higher CTR and a 17% lift in impression share.' },
            { client: 'Elevated Diversity', industry: 'Consulting', result: '24% increase in leads', context: 'Diversity, equity, and inclusion consulting firm. Google Ads, 90 days: built from competitor analysis, the best-performing geolocations, and the most relevant industries to target. Also a 15% lower CPL and 38% more website traffic.' },
            { client: 'Health & Wellness with HBOT', industry: 'Health & Wellness', result: '21% growth in lead volume', context: 'Wellness and longevity clinic. Google Ads, 90 days: a service-based structure that separated HBOT from the other wellness and medspa services, with keywords refined from search terms. Also a 12% spend efficiency gain and a 27% lower CPA.' },
            { client: 'Ironclad Plumbing', industry: 'Plumbing', result: '100% increase in lead volume', context: 'Plumbing company in Southwest Florida. Google Ads plus Local Services Ads, 90 days: budget focused on high-value jobs like water heater installs, the LSA profile optimized, and invalid leads disputed. Lead volume doubled quarter over quarter, with a 10% lower CPA and a 50% higher conversion rate.' },
        ]),

        // E-commerce
        ...buildCaseStudies('ecommerce', [
            { client: 'ACACIA Swimwear', industry: 'Fashion', result: '778% growth in new customers', context: 'Swim and ready-to-wear brand. Google Ads and Meta Ads, 12 months: Google Shopping with first-time-buyer incentives and a segmented geographic rollout. Also a 17% lower CPC and an 8% higher AOV.' },
            { client: 'VOLO Beauty', industry: 'Beauty', result: '43% topline revenue growth', context: 'Premium haircare brand. Google Ads and Meta Ads, 90 days: campaigns segmented by priority collections, with bundles driving a higher order value. Also a 66% conversion rate uplift and a 122% uplift in Google Ads sales.' },
            { client: 'Vault Light', industry: 'Home/Lighting', result: '200% orders uplift', context: 'Premium lighting brand. Google Ads and Meta Ads, 90 days: Google Ads rebuilt around intent and segmented by product category (chandeliers, sconces, pendants). Also a 302% higher AOV and a 58% lower CPA.' },
            { client: 'FragranceBuy', industry: 'Beauty', result: '252% revenue uplift', context: 'Online fragrance retailer with 20,000+ SKUs. Google Ads and Meta Ads, 6 months: fixed conversion tracking that was double reporting, then managed the catalog feed for Shopping and Performance Max. Also a 205% higher ROAS and a 30% lower CPC.' },
            { client: 'The Cover Guy', industry: 'Pool & Spa', result: '41% growth in revenue', context: 'Hot tub covers and accessories ecommerce. Google Ads and Microsoft Ads, 12 months: budgets shifted between the two channels by performance, region, and season. Also a 58% ROAS lift.' },
            { client: 'Toddlekind', industry: 'Baby Products', result: '211% growth in revenue', context: 'Premium playmat brand. Google Ads, 90 days, across the US, UK, and EU with a tailored approach per region, including Performance Max prospecting in the US. Also a 185% higher ROAS and a 32% higher MER.' },
            { client: 'Grant Stone', industry: 'Footwear', result: '23% revenue gain', context: 'Premium DTC footwear brand for men. Google Ads, 12 months: shopping feed optimization, seasonal campaign segmentation, and Performance Max, while holding ROAS above 14x. Also a 33% lower CPA.' },
            { client: 'Goodwear', industry: 'Apparel', result: '49% growth in revenue', context: 'Made-in-USA apparel brand. Google Ads and Meta Ads, 12 months: scaled non-branded search and Performance Max for new customer acquisition. Also 23% more purchases and a 13% higher conversion rate.' },
            { client: 'Williams Athletic Club', industry: 'Sports/Fitness', result: '431% increase in ROAS', context: 'Women-owned athleisure apparel brand. Google Ads and Meta Ads, 5 months: moved from awareness-heavy spend to a performance-led strategy. Also a 75% conversion rate uplift and a 78% lower CPA.' },
            { client: 'Black Halo', industry: 'Fashion', result: '37% MoM revenue growth', context: 'LA fashion brand for women. Google Ads, 5 months: scaled non-branded search and segmented Performance Max by best-sellers, clearance, and new launches. Also 38% month-over-month traffic growth and a 16% lower CPA.' },
            { client: 'Green Eco Dream', industry: 'Retail', result: '71% YoY revenue growth', context: 'Eco-friendly essentials retailer. Google Ads and Meta Ads, over 3 years: UGC on YouTube plus competitor search campaigns. Also a 54% brand uplift and a 46% year-over-year conversion rate boost.' },
            { client: 'FragFlex', industry: 'Fragrance', result: '14% revenue uplift', context: 'US fragrance retailer with 50,000+ SKUs. Google Ads, 6 months: clean conversion tracking from day one and a managed catalog feed for Shopping and Performance Max. Also a 17% higher ROAS and a 28% lower CPC.' },
            { client: 'Thai Basil', industry: 'Restaurant online ordering', result: '195% increase in revenue', context: 'Thai restaurant in Ithaca, NY moving orders off delivery apps and onto its own site. Google Ads, 90 days: the account segmented by delivery and takeout, dine-in, and catering, with Square POS conversion tracking. Also an 18% higher AOV and an 11% lower CPC.' },
        ]),

        // AI builds
        ...buildCaseStudies('ai', [
            { client: 'Ironclad Plumbing AI Voice Agent', industry: 'Plumbing', result: '$38,674 generated in one 30-day window', context: 'An AI voice agent on the existing phone number of a plumbing company. It answers every call 24/7, classifies the job, captures the address and contact details, books the visit, and sends true emergencies straight to the owner. In that 30-day window it answered 39 calls and 56% were booked as work.' },
            { client: 'Ironclad Plumbing Estimate Recovery', industry: 'Plumbing', result: '$18,349 recovered in one 30-day window', context: 'An AI automation for a plumbing company: every open estimate gets a timed follow-up sequence written in the company voice, and replies route to the office for a human close. 8 estimates won back in 30 days.' },
        ]),

        // Website builds
        ...buildCaseStudies('web_development', [
            { client: 'Ironclad Plumbing Website', industry: 'Plumbing', result: '53% increase in engagement rate', context: 'Full website build for a plumbing company that had no site and ran on its Google Business Profile. Also a 100/100 SEO score and an 8% higher conversion rate.' },
            { client: 'Thai Basil Website', industry: 'Restaurant', result: '19% increase in conversion rate', context: 'Full website build with commission-free direct ordering for a Thai restaurant that only took orders through delivery apps. Also a 92/100 SEO score and a 13% higher engagement rate.' },
            { client: 'Old Fashion Barbershop Website', industry: 'Barbershop', result: '100/100 SEO score', context: 'Full website build for a Naples, FL barbershop that had no site. Also a 100/100 best practices score.' },
            { client: 'House Rescue Handyman Website', industry: 'Handyman', result: '100/100 SEO score', context: 'Full website build for an NYC-area handyman who only had a Google Business Profile, with a before-and-after gallery and a photo-upload estimate form. Also a 100/100 best practices score.' },
        ]),

        // Services
        { type: CONTENT_TYPES.SERVICE, industry: 'all', title: 'Google Ads Management',
          content: 'Search, Shopping, Performance Max, YouTube, Display Remarketing, Demand Gen. Most clients see traction in 30-45 days. We do complete account audits, conversion tracking setup, campaign architecture design, weekly optimization, feed management at SKU level, and GA4/GTM setup.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'all', title: 'Meta Ads Management',
          content: 'Lead gen, Advantage+ Shopping, video campaigns, app promotions, dynamic retargeting, lookalike audiences. We test 15-20+ creative variations weekly. Full creative strategy, Conversion API implementation, CRM-based attribution.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'b2b', title: 'LinkedIn Ads Management',
          content: 'Sponsored Content, Lead Gen Forms, Message Ads, Document Ads. Best for B2B targeting by job title, seniority, company size. Higher CPCs but way better lead quality. 65% lower cost per qualified lead after audience refinement.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'all', title: 'AI Automations',
          content: 'Custom workflow automation using Zapier, Make, n8n, and custom APIs. Lead nurture sequences, reporting automation, data sync, email sequences. Saves 15+ hours per week. Simple workflows 1-2 weeks, complex 3-4 weeks to build.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'all', title: 'AI Agents',
          content: '24/7 lead qualification, customer support, appointment booking agents trained on your business knowledge. Multi-channel: chat, SMS, email, social. 70% of support tickets resolved automatically. 2-3 week build time.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'home_services', title: 'Local SEO',
          content: 'Google Business Profile optimization, local keyword targeting, citation building across 80+ directories, review management. 150% visibility increase typical. Results in 60-90 days. 46% of Google searches have local intent.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'all', title: 'CRO - Conversion Rate Optimization',
          content: 'A/B testing, landing page optimization, funnel analysis, heatmaps and session recordings. Around 34% average conversion lift across clients, up to 66% on individual tests. Need 10k+ monthly visitors for A/B testing. Tools: VWO, Hotjar, GA4.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'b2b', title: 'Microsoft Ads Management',
          content: 'Bing Search, Audience Network, LinkedIn-targeted search campaigns. Typically around 35% lower CPCs than Google Ads for the same keywords. Strong fit for B2B and older demographics. Often runs parallel to a Google Ads account to capture search volume Google misses.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'all', title: 'Brand Strategy',
          content: 'Positioning, messaging frameworks, value proposition development, visual identity. Delivered as a brand guidelines document plus messaging matrix. Foundational work for companies repositioning or entering a new market. Usually a 4-6 week engagement, often paired with a website rebuild or paid ads relaunch.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'all', title: 'Web Development',
          content: 'WordPress for service businesses, content sites, and SEO-driven projects. Shopify for e-commerce. Conversion-focused builds with server-side rendering, JSON-LD schema, Core Web Vitals optimization, and on-page SEO baked in from day one. Typical build 4-8 weeks depending on scope. Includes GA4, conversion tracking, and handoff documentation.' },

        // Resources (lead magnets). URLs are live pages on the Resource Hub
        // (thesnowmedia.com/resources). Share the actual link in chat when a visitor
        // won't book or isn't a fit, never as a dodge from the call.
        { type: CONTENT_TYPES.RESOURCE, industry: 'ecommerce', title: 'E-Commerce Ad Benchmark Report',
          content: 'Free benchmark report with average CPC, CPA, ROAS, and conversion rates for e-commerce brands across Google and Meta. Compare your performance to industry averages. Available free at https://thesnowmedia.com/resources/ecommerce-ad-benchmarks/' },
        { type: CONTENT_TYPES.RESOURCE, industry: 'home_services', title: 'Home Services Ad Benchmark Report',
          content: 'Free benchmark report with average cost per lead, conversion rates, and budget recommendations for plumbing, HVAC, roofing, electrical, and solar businesses. Available free at https://thesnowmedia.com/resources/home-services-ad-benchmarks/' },
        { type: CONTENT_TYPES.RESOURCE, industry: 'consulting', title: 'Consulting Ad Benchmark Report',
          content: 'Free benchmark report with average cost per lead, booked-call rates, and budget guidance for coaches, consultants, and professional services. Available free at https://thesnowmedia.com/resources/consulting-ad-benchmarks/' },
        { type: CONTENT_TYPES.RESOURCE, industry: 'all', title: 'Ad Budget Calculator',
          content: 'Free interactive calculator to determine optimal ad spend based on your revenue goals, margins, and target CPA. Shows projected leads and ROI. Available free at https://thesnowmedia.com/resources/ad-budget-calculator/' },
        { type: CONTENT_TYPES.RESOURCE, industry: 'all', title: 'AI Automation ROI Calculator',
          content: 'Free calculator showing how much time and money you can save with AI automation. Input your current manual hours and see projected savings. Available free at https://thesnowmedia.com/resources/ai-roi-calculator/' },
        { type: CONTENT_TYPES.RESOURCE, industry: 'all', title: 'AI Readiness Assessment',
          content: 'Free assessment that scores how ready your business is to adopt AI agents and automation, with the highest-leverage first moves for your situation. Available free at https://thesnowmedia.com/resources/ai-readiness-assessment/' },
        { type: CONTENT_TYPES.RESOURCE, industry: 'all', title: 'Agency Performance Scorecard',
          content: 'Free scorecard to evaluate your current marketing agency or in-house team. Covers 12 key performance areas. Available free at https://thesnowmedia.com/resources/agency-scorecard/' },
        { type: CONTENT_TYPES.RESOURCE, industry: 'all', title: 'Google Ads Audit Checklist',
          content: 'Free 50-point checklist to audit your Google Ads account. Covers campaign structure, keyword strategy, ad copy, landing pages, tracking, and budget allocation. Available free at https://thesnowmedia.com/resources/google-ads-audit-checklist/' },
        { type: CONTENT_TYPES.RESOURCE, industry: 'all', title: 'Meta Ads Audit Checklist',
          content: 'Free checklist to audit your Meta (Facebook/Instagram) ads account: account structure, creative, audiences, pixel/CAPI tracking, and budget. Available free at https://thesnowmedia.com/resources/meta-ads-audit-checklist/' },

        // FAQs
        { type: CONTENT_TYPES.FAQ, industry: 'all', title: 'How long until I see results?',
          content: 'Most clients see meaningful traction within 30-45 days. Strongest improvements typically come between months 2-4. For local SEO, expect 60-90 days. For CRO, first wins in 30 days.' },
        { type: CONTENT_TYPES.FAQ, industry: 'all', title: 'What makes you different from other agencies?',
          content: 'Senior strategists run every account, no junior handoffs. Boutique by design with a capped client roster. Month-to-month contracts. Direct access to your campaign manager. Founded by Snow Petrovic who built and sold her own ecommerce brand.' },
        { type: CONTENT_TYPES.FAQ, industry: 'all', title: 'Do you require long-term contracts?',
          content: 'No. We do month-to-month. If we dont perform, you can walk. No hard feelings. We earn your business every month.' },
    ];

    // Match existing seed rows by title. New titles get seeded; seed rows whose
    // CONTENT has drifted from this file get re-seeded (re-embed + swap) so this
    // file stays the single source of truth. Learned (non-seed) patterns are
    // never touched.
    const existingPatterns = db.listPatterns({ limit: 500, minConfidence: 0, status: 'all' });
    const existingByTitle = new Map(existingPatterns.map(p => [p.title, p]));

    const newItems = [];
    const driftedItems = [];
    for (const item of content) {
        const existing = existingByTitle.get(item.title);
        if (!existing) { newItems.push(item); continue; }
        if (existing.tagged_by !== 'seed') continue;
        const storedContent = existing.messages && existing.messages[0] ? existing.messages[0].content : null;
        if (storedContent !== item.content) driftedItems.push({ item, oldId: existing.id });
    }

    if (newItems.length === 0 && driftedItems.length === 0) {
        console.log(`Knowledge base up to date (${existingPatterns.length} items)`);
        return;
    }

    // Re-seed drifted items. Generate the new embedding FIRST and only swap once
    // it succeeds, so a transient embedding failure never drops a knowledge row.
    let updated = 0;
    for (const { item, oldId } of driftedItems) {
        try {
            const embedding = await embeddingService.generateEmbeddings(item.content);
            if (!embedding) continue;
            db.deletePattern(oldId);
            db.createPattern({
                conversation_id: null,
                pattern_type: item.type,
                title: item.title,
                description: item.industry,
                messages: [{ role: 'knowledge', content: item.content }],
                embedding,
                booking_achieved: false,
                tagged_by: 'seed',
                confidence_score: 1.0
            });
            updated++;
        } catch (err) {
            console.error(`Error re-seeding "${item.title}":`, err.message);
        }
    }
    if (updated > 0) console.log(`Knowledge base re-seeded ${updated} drifted items`);

    if (newItems.length === 0) {
        console.log(`Knowledge base up to date (${existingPatterns.length} items, ${updated} updated)`);
        return;
    }

    console.log(`Seeding ${newItems.length} new knowledge base items...`);

    let seeded = 0;
    for (const item of newItems) {
        try {
            const embedding = await embeddingService.generateEmbeddings(item.content);
            if (embedding) {
                db.createPattern({
                    conversation_id: null,
                    pattern_type: item.type,
                    title: item.title,
                    description: item.industry,
                    messages: [{ role: 'knowledge', content: item.content }],
                    embedding,
                    booking_achieved: false,
                    tagged_by: 'seed',
                    confidence_score: 1.0
                });
                seeded++;
            }
        } catch (err) {
            console.error(`Error seeding "${item.title}":`, err.message);
        }
    }

    console.log(`Knowledge base seeded ${seeded} new items (total: ${existingPatterns.length + seeded})`);
}

/**
 * Helper to build case study entries
 */
function buildCaseStudies(industry, studies) {
    return studies.map(s => ({
        type: CONTENT_TYPES.CASE_STUDY,
        industry,
        title: `${s.client} (${s.industry}): ${s.result}`,
        content: `Case study: ${s.client} in ${s.industry}. Result: ${s.result}. ${s.context}`
    }));
}

module.exports = {
    seedIfEmpty,
    CONTENT_TYPES
};
