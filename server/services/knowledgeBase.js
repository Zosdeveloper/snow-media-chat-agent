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
        // Case studies - Home Services
        ...buildCaseStudies('home_services', [
            { client: 'PlugPV', industry: 'Solar', result: '230% boost in SQLs', context: 'Home services solar company struggling with inconsistent lead flow. We restructured their Google Ads campaigns and implemented conversion tracking.' },
            { client: 'SPEAR Physical Therapy', industry: 'Healthcare', result: '63% increase in bookings across 50+ locations', context: 'Multi-location healthcare practice. Scaled Google and Meta campaigns with location-specific targeting.' },
            { client: 'GymTonic', industry: 'Fitness', result: '399% increase in new members', context: 'Fitness business needed to fill memberships. Used Meta Ads with creative velocity and Google local campaigns.' },
            { client: 'BMS Moving & Storage', industry: 'Moving', result: '70% uplift in SQLs', context: 'Moving company with seasonal demand. Implemented full-funnel Google Ads with Performance Max.' },
            { client: 'Waxxpot', industry: 'Beauty/Wellness', result: '37% increase in online bookings', context: 'Beauty service chain. Optimized Meta Ads and Google local campaigns for appointment bookings.' },
            { client: 'Bitty & Beaus Coffee', industry: 'Restaurant', result: '334% growth in store visits', context: 'Restaurant chain. Used Google local campaigns and Meta Ads to drive foot traffic.' },
            { client: 'ClubExec Auto', industry: 'Automotive', result: '18% increase in leads', context: 'Automotive service business. Optimized Google Ads for local lead generation.' },
            { client: 'HookSounds', industry: 'Entertainment', result: '20% boost in CVR', context: 'Entertainment/music licensing platform. Improved conversion rates through landing page optimization and targeted campaigns.' },
            { client: 'Elevated Diversity', industry: 'Consulting', result: '24% increase in leads', context: 'Consulting firm focused on diversity and inclusion. LinkedIn Ads and Google Ads for B2B lead generation.' },
            { client: 'Health & Wellness with HBOT', industry: 'Health & Wellness', result: '21% growth in lead volume', context: 'Hyperbaric oxygen therapy provider. Google Ads and local SEO for patient acquisition.' },
        ]),

        // Case studies - E-Commerce
        ...buildCaseStudies('ecommerce', [
            { client: 'ACACIA Swimwear', industry: 'Fashion', result: '778% growth in new customers', context: 'DTC fashion brand. Scaled Advantage+ Shopping and prospecting campaigns on Meta.' },
            { client: 'VOLO Beauty', industry: 'Beauty', result: '43% topline revenue growth', context: 'Beauty ecommerce. Full-funnel Google Shopping + Meta retargeting strategy.' },
            { client: 'Vault Light', industry: 'Home/Lighting', result: '200% orders uplift', context: 'Home goods ecommerce. Rebuilt Google Shopping feed and launched Performance Max.' },
            { client: 'FragranceBuy', industry: 'Beauty', result: '252% revenue uplift', context: 'Fragrance ecommerce. Optimized Google Shopping feed at SKU level and launched Demand Gen.' },
            { client: 'The Cover Guy', industry: 'Pool & Spa', result: '41% growth in revenue', context: 'Pool covers ecommerce. Multi-channel Google + Meta strategy with creative testing.' },
            { client: 'Toddlekind', industry: 'Baby Products', result: '211% growth in revenue', context: 'Baby products DTC. Advantage+ Shopping + prospecting with UGC creative.' },
            { client: 'Grant Stone', industry: 'Footwear', result: '23% revenue gain', context: 'Premium footwear DTC. Maintained 14x+ ROAS while scaling spend.' },
            { client: 'Goodwear', industry: 'Apparel', result: '49% growth in revenue', context: 'Apparel ecommerce. Creative velocity approach with 15-20 variations weekly.' },
            { client: 'Williams Athletic Club', industry: 'Sports/Fitness', result: '431% increase in ROAS', context: 'Athletic club ecommerce. Restructured Google and Meta campaigns for maximum return on ad spend.' },
            { client: 'Black Halo', industry: 'Fashion', result: '37% MoM revenue growth', context: 'Fashion DTC brand. Month-over-month growth through Meta Ads creative testing and Google Shopping optimization. 72% lower CPA.' },
            { client: 'Green Eco Dream', industry: 'Retail', result: '71% YoY revenue growth', context: 'Eco-friendly retail brand. Year-over-year growth through full-funnel Google and Meta strategy.' },
            { client: 'FragFlex', industry: 'Fragrance', result: '14% revenue uplift', context: 'Fragrance ecommerce. Google Shopping feed optimization and Performance Max campaigns.' },
        ]),

        // Services
        { type: CONTENT_TYPES.SERVICE, industry: 'all', title: 'Google Ads Management',
          content: 'Search, Shopping, Performance Max, YouTube, Display Remarketing, Demand Gen. Min $5k/mo ad spend. Most clients see traction in 30-45 days. We do complete account audits, conversion tracking setup, campaign architecture design, weekly optimization, feed management at SKU level, and GA4/GTM setup.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'all', title: 'Meta Ads Management',
          content: 'Lead gen, Advantage+ Shopping, video campaigns, app promotions, dynamic retargeting, lookalike audiences. Min $3k/mo ad spend. We test 15-20+ creative variations weekly. Full creative strategy, Conversion API implementation, CRM-based attribution.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'b2b', title: 'LinkedIn Ads Management',
          content: 'Sponsored Content, Lead Gen Forms, Message Ads, Document Ads. Best for B2B targeting by job title, seniority, company size. Min $3-5k/mo. Higher CPCs but way better lead quality. 65% lower cost per qualified lead after audience refinement.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'all', title: 'AI Automations',
          content: 'Custom workflow automation using Zapier, Make, n8n, and custom APIs. Lead nurture sequences, reporting automation, data sync, email sequences. Saves 15-20 hours per week. Simple workflows 1-2 weeks, complex 3-4 weeks to build.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'all', title: 'AI Agents',
          content: '24/7 lead qualification, customer support, appointment booking agents trained on your business knowledge. Multi-channel: chat, SMS, email, social. 70% of support tickets resolved automatically. 2-3 week build time.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'home_services', title: 'Local SEO',
          content: 'Google Business Profile optimization, local keyword targeting, citation building across 80+ directories, review management. 150% visibility increase typical. Results in 60-90 days. 46% of Google searches have local intent.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'all', title: 'CRO - Conversion Rate Optimization',
          content: 'A/B testing, landing page optimization, funnel analysis, heatmaps and session recordings. Typical 30-60% improvement in first 90 days. Need 10k+ monthly visitors for A/B testing. Tools: VWO, Hotjar, GA4.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'b2b', title: 'Microsoft Ads Management',
          content: 'Bing Search, Audience Network, LinkedIn-targeted search campaigns. Typically around 35% lower CPCs than Google Ads for the same keywords. Strong fit for B2B and older demographics. Often runs parallel to a Google Ads account to capture search volume Google misses. Min $2-3k/mo ad spend recommended.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'all', title: 'Brand Strategy',
          content: 'Positioning, messaging frameworks, value proposition development, visual identity. Delivered as a brand guidelines document plus messaging matrix. Foundational work for companies repositioning or entering a new market. Usually a 3-5 week engagement, often paired with a website rebuild or paid ads relaunch.' },
        { type: CONTENT_TYPES.SERVICE, industry: 'all', title: 'Web Development',
          content: 'WordPress for service businesses, content sites, and SEO-driven projects. Shopify for e-commerce. Conversion-focused builds with server-side rendering, JSON-LD schema, Core Web Vitals optimization, and on-page SEO baked in from day one. Typical build 4-8 weeks depending on scope. Includes GA4, conversion tracking, and handoff documentation.' },

        // Resources (lead magnets)
        { type: CONTENT_TYPES.RESOURCE, industry: 'ecommerce', title: 'E-Commerce Ad Benchmark Report',
          content: 'Free benchmark report with average CPC, CPA, ROAS, and conversion rates for e-commerce brands across Google and Meta. Compare your performance to industry averages.' },
        { type: CONTENT_TYPES.RESOURCE, industry: 'home_services', title: 'Home Services Ad Benchmark Report',
          content: 'Free benchmark report with average cost per lead, conversion rates, and budget recommendations for plumbing, HVAC, roofing, electrical, and solar businesses.' },
        { type: CONTENT_TYPES.RESOURCE, industry: 'all', title: 'Ad Budget Calculator',
          content: 'Free interactive calculator to determine optimal ad spend based on your revenue goals, margins, and target CPA. Shows projected leads and ROI.' },
        { type: CONTENT_TYPES.RESOURCE, industry: 'all', title: 'AI Automation ROI Calculator',
          content: 'Free calculator showing how much time and money you can save with AI automation. Input your current manual hours and see projected savings.' },
        { type: CONTENT_TYPES.RESOURCE, industry: 'all', title: 'Agency Performance Scorecard',
          content: 'Free scorecard to evaluate your current marketing agency or in-house team. Covers 12 key performance areas.' },
        { type: CONTENT_TYPES.RESOURCE, industry: 'all', title: 'Google Ads Audit Checklist',
          content: 'Free 50-point checklist to audit your Google Ads account. Covers campaign structure, keyword strategy, ad copy, landing pages, tracking, and budget allocation.' },

        // FAQs
        { type: CONTENT_TYPES.FAQ, industry: 'all', title: 'How long until I see results?',
          content: 'Most clients see meaningful traction within 30-45 days. Strongest improvements typically come between months 2-4. For local SEO, expect 60-90 days. For CRO, first wins in 30 days.' },
        { type: CONTENT_TYPES.FAQ, industry: 'all', title: 'What makes you different from other agencies?',
          content: 'Senior strategists run every account, no junior handoffs. Boutique by design with a capped client roster. Month-to-month contracts. Direct access to your campaign manager. Founded by Snow Petrovic who built and sold her own ecommerce brand.' },
        { type: CONTENT_TYPES.FAQ, industry: 'all', title: 'Do you require long-term contracts?',
          content: 'No. We do month-to-month. If we dont perform, you can walk. No hard feelings. We earn your business every month.' },
    ];

    // Check which items already exist (by title match)
    const existingPatterns = db.listPatterns({ limit: 200, minConfidence: 0 });
    const existingTitles = new Set(existingPatterns.map(p => p.title));

    const newItems = content.filter(item => !existingTitles.has(item.title));

    if (newItems.length === 0) {
        console.log(`Knowledge base up to date (${existingPatterns.length} items)`);
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
