/* ============================================================
   Alembic MedLearn — Data Layer (Module-wise, 3 Modules)
   ============================================================ */

const DB = {
  users: [],

  // 3 published modules. Module slide decks are attached by an administrator in the live portal.
  modules: [
    {
      id: 'm1',
      title: 'Dermatology Fundamentals',
      subtitle: 'Skin Conditions, Diagnosis & Management',
      status: 'active',
      description: 'A comprehensive module covering common dermatological conditions, diagnostic approaches, and evidence-based treatment protocols published by the British Association of Dermatologists.',
      duration: 45,
      color: '#E31837',
      accentColor: '#FF4D6A',
      icon: '🩺',
      tag: 'BAD Certified',
      contents: [
        { type: 'slide_deck', id: 'sd1', title: 'Introduction to Dermatology', duration: 15, slides: 8 },
        // { type: 'article',    id: 'ar1', title: 'Psoriasis: Clinical Manifestations & Treatment', duration: 12, readTime: '12 min read' },
        { type: 'article',    id: 'ar2', title: 'Eczema Management in Adults', duration: 10, readTime: '10 min read' },
        { type: 'mcq',        id: 'mq1', title: 'Module 1 Assessment', duration: 15, questions: 10 }
      ]
    },
    {
      id: 'm2',
      title: 'Advanced Skin Therapeutics',
      subtitle: 'Biologics, Novel Therapies & Clinical Outcomes',
      status: 'active',
      description: 'Explore cutting-edge biologic therapies, targeted treatments, and the latest clinical trial outcomes in dermatology practice.',
      duration: 50,
      color: '#C41230',
      accentColor: '#E31837',
      icon: '💊',
      tag: 'BAD Certified',
      contents: []
    },
    {
      id: 'm3',
      title: 'Procedural Dermatology',
      subtitle: 'Techniques, Safety & Patient Communication',
      status: 'active',
      description: 'Master procedural skills including dermoscopy, biopsies, and aesthetic procedures with detailed video-supported guidance.',
      duration: 60,
      color: '#A00E28',
      accentColor: '#C41230',
      icon: '🔬',
      tag: 'BAD Certified',
      contents: []
    }
  ],

  // Slide Deck Content
  slideDecks: {
    'sd1': {
      title: 'Introduction to Dermatology',
      subtitle: 'Skin Conditions, Diagnosis & Management',
      slides: [
        {
          id: 1,
          title: 'Welcome to Dermatology Fundamentals',
          content: 'This module, developed in partnership with the British Association of Dermatologists, provides a structured clinical framework for understanding, diagnosing, and managing common skin conditions in clinical practice.',
          visual: 'intro',
          stats: [{ label: 'Conditions Covered', value: '24' }, { label: 'Evidence Level', value: '1A' }, { label: 'CME Credits', value: '4.5' }]
        },
        {
          id: 2,
          title: 'Epidemiology of Skin Disease',
          content: 'Skin diseases affect approximately 1.9 billion people worldwide at any given time. Dermatological conditions account for nearly 34% of all primary care consultations in the UK and India.',
          visual: 'chart',
          highlights: ['34% of GP consultations', '1.9 Billion affected globally', '2nd most common reason for referral']
        },
        {
          id: 3,
          title: 'The ABCDE Rule in Skin Assessment',
          content: 'Systematic skin examination using the ABCDE framework ensures no malignant or pre-malignant lesion is missed. This approach is particularly critical when evaluating pigmented lesions.',
          visual: 'abcde',
          points: [
            { letter: 'A', term: 'Asymmetry', desc: 'One half unlike the other' },
            { letter: 'B', term: 'Border', desc: 'Irregular, ragged, or blurred' },
            { letter: 'C', term: 'Colour', desc: 'Variation in pigmentation' },
            { letter: 'D', term: 'Diameter', desc: 'Greater than 6mm' },
            { letter: 'E', term: 'Evolution', desc: 'Change over time' }
          ]
        },
        {
          id: 4,
          title: 'Classification of Skin Lesions',
          content: 'Primary lesions arise from normal skin, while secondary lesions evolve from primary lesions. Accurate morphological description is the cornerstone of dermatological diagnosis.',
          visual: 'classification',
          primary: ['Macule', 'Papule', 'Plaque', 'Nodule', 'Vesicle', 'Pustule', 'Wheal', 'Bulla'],
          secondary: ['Scale', 'Crust', 'Erosion', 'Ulcer', 'Scar', 'Lichenification', 'Atrophy', 'Excoriation']
        },
        {
          id: 5,
          title: 'Common Inflammatory Dermatoses',
          content: 'Inflammatory skin conditions represent the largest category of dermatological presentations. Early recognition and appropriate management prevents disease progression and improves quality of life.',
          visual: 'conditions',
          conditions: [
            { name: 'Psoriasis', prevalence: '2-3%', type: 'Chronic Inflammatory' },
            { name: 'Atopic Eczema', prevalence: '15-20% children', type: 'Allergic' },
            { name: 'Rosacea', prevalence: '5-10%', type: 'Vascular Inflammatory' },
            { name: 'Urticaria', prevalence: '20% lifetime', type: 'Mast Cell Mediated' }
          ]
        },
        {
          id: 6,
          title: 'Topical Therapy Principles',
          content: 'Vehicle selection is as important as active ingredient choice. The base formulation affects drug penetration, patient adherence, and therapeutic outcome significantly in dermatological practice.',
          visual: 'therapy',
          vehicles: [
            { type: 'Ointment', use: 'Dry, scaly lesions', potency: 'Most potent penetration' },
            { type: 'Cream', use: 'Moist/weeping areas', potency: 'Moderate penetration' },
            { type: 'Lotion', use: 'Hairy areas, scalp', potency: 'Least penetration' },
            { type: 'Gel', use: 'Acne, scalp', potency: 'Good penetration' }
          ]
        },
        {
          id: 7,
          title: 'Alembic Dermatology Portfolio',
          content: 'Alembic\'s dermatology range offers evidence-based solutions across inflammatory, infective, and aesthetic skin conditions, aligned with BAD clinical guidelines and formulated for Indian skin types.',
          visual: 'portfolio',
          categories: ['Corticosteroids', 'Antifungals', 'Retinoids', 'Immunomodulators', 'Combination Therapies']
        },
        {
          id: 8,
          title: 'Key Takeaways & Next Steps',
          content: 'You have completed the Introduction to Dermatology slide deck. Proceed to the article readings and complete the Module 1 Assessment to earn your CME certificate.',
          visual: 'summary',
          takeaways: [
            'Systematic ABCDE assessment prevents missed diagnoses',
            'Morphology description guides clinical decisions',
            'Vehicle selection is critical for topical therapy',
            'Inflammatory dermatoses require long-term management strategies'
          ]
        }
      ]
    }
  },

  // Articles
  articles: {
    // 'ar1': {
    //   title: 'Psoriasis: Clinical Manifestations & Treatment',
    //   subtitle: 'Evidence-Based Management Strategies',
    //   author: 'British Association of Dermatologists',
    //   readTime: '12 min read',
    //   publishedDate: 'April 2025',
    //   category: 'Inflammatory Dermatology',
    //   content: [
    //     {
    //       heading: 'Introduction',
    //       text: 'Psoriasis is a chronic, immune-mediated inflammatory skin disease affecting approximately 2–3% of the global population. It is characterised by well-demarcated erythematous plaques with silvery scaling, most commonly affecting the elbows, knees, scalp, and sacral region. Beyond its cutaneous manifestations, psoriasis carries significant systemic implications including psoriatic arthritis, cardiovascular disease, metabolic syndrome, and substantial psychosocial burden.'
    //     },
    //     {
    //       heading: 'Pathophysiology',
    //       text: 'The pathogenesis of psoriasis involves complex interactions between genetic predisposition, environmental triggers, and immune dysregulation. The disease is driven by the IL-23/Th17 axis, where dendritic cells produce IL-23, which promotes differentiation of naïve T cells into Th17 cells. These cells secrete IL-17A, IL-17F, and IL-22, driving keratinocyte proliferation, epidermal thickening, and the characteristic inflammatory infiltrate.',
    //       highlight: 'Key cytokines: IL-17A, IL-17F, IL-22, TNF-α, IL-23 — forming the therapeutic targets of modern biologics.'
    //     },
    //     {
    //       heading: 'Clinical Classification',
    //       text: 'Psoriasis severity is classified using the Psoriasis Area and Severity Index (PASI) and the Dermatology Life Quality Index (DLQI). Mild disease is defined as BSA <10% and PASI <10; moderate-to-severe as BSA ≥10% or PASI ≥10 with DLQI ≥10. This classification guides therapeutic escalation from topical agents to systemic therapies and biologics.',
    //       table: {
    //         headers: ['Severity', 'BSA', 'PASI', 'DLQI', 'Treatment'],
    //         rows: [
    //           ['Mild', '<10%', '<10', '<10', 'Topicals'],
    //           ['Moderate', '10-30%', '10-20', '10-20', 'Phototherapy / csDMARDs'],
    //           ['Severe', '>30%', '>20', '>20', 'Biologics / targeted therapy']
    //         ]
    //       }
    //     },
    //     {
    //       heading: 'First-Line Topical Management',
    //       text: 'Topical corticosteroids remain the cornerstone of mild psoriasis management. Potent preparations (Class III-IV) are appropriate for body plaques, while mild preparations are preferred for the face and flexures. Combination products containing a corticosteroid with calcipotriol (Vitamin D analogue) demonstrate superior efficacy and improved adherence compared to monotherapy, with a well-established safety profile for long-term use.'
    //     },
    //     {
    //       heading: 'Systemic & Biologic Therapies',
    //       text: 'For moderate-to-severe disease, conventional systemic agents including methotrexate, cyclosporine, and acitretin have established roles. However, biologic therapies — including anti-TNF agents (adalimumab, etanercept), anti-IL-12/23 agents (ustekinumab), anti-IL-17 agents (secukinumab, ixekizumab), and anti-IL-23 agents (guselkumab, risankizumab) — have transformed outcomes, achieving PASI 90 responses in 60–80% of patients.',
    //       highlight: 'Newer IL-23 inhibitors demonstrate durable PASI 100 responses with improved safety profiles compared to earlier biologics.'
    //     },
    //     {
    //       heading: 'Clinical Pearls',
    //       text: 'Koebner phenomenon — the induction of psoriatic lesions at sites of trauma — must be considered when planning procedures in affected patients. Nail involvement occurs in up to 50% of patients and is a significant risk factor for psoriatic arthritis. Annual cardiovascular risk screening is recommended in all patients with moderate-to-severe disease.',
    //       bullets: [
    //         'Screen for psoriatic arthritis at every consultation',
    //         'DLQI assessment guides treatment decisions and monitoring',
    //         'Avoid abrupt withdrawal of systemic corticosteroids — risk of generalised pustular psoriasis',
    //         'Maintain adequate sun protection — UV triggers can worsen disease in some subtypes'
    //       ]
    //     }
    //   ]
    // },
    'ar2': {
      title: 'Eczema Management in Adults',
      subtitle: 'Atopic Dermatitis: Diagnosis, Triggers & Stepwise Therapy',
      author: 'British Association of Dermatologists',
      readTime: '10 min read',
      publishedDate: 'April 2025',
      category: 'Inflammatory Dermatology',
      content: [
        {
          heading: 'Overview of Atopic Dermatitis',
          text: 'Atopic dermatitis (AD) is the most common inflammatory skin disease, affecting 15–20% of children and 1–10% of adults globally. Characterised by pruritus, xerosis, and recurrent eczematous lesions, AD significantly impairs quality of life and is frequently associated with the "atopic triad" of asthma, allergic rhinitis, and food allergy. In adults, the flexural distribution (antecubital and popliteal fossae, neck, wrists) predominates.'
        },
        {
          heading: 'Pathogenesis & Barrier Dysfunction',
          text: 'Mutations in the filaggrin gene (FLG) are the strongest genetic risk factor for AD, leading to impaired epidermal barrier function. This allows increased transepidermal water loss and penetration of allergens and microorganisms. Staphylococcus aureus colonisation, present in >90% of AD patients, triggers immune activation via superantigen production and exacerbates the Th2-predominant inflammatory response.',
          highlight: 'Filaggrin mutations are present in up to 30% of European AD patients — a key target for moisturiser therapy and barrier repair.'
        },
        {
          heading: 'Stepwise Management Approach',
          text: 'BAD guidelines advocate a stepwise therapeutic approach based on disease severity. Emollient therapy forms the foundation of all treatment steps, with liberal application (at least 250–500g/week) essential for barrier maintenance. Topical corticosteroids are the mainstay of active treatment, with potency matched to the site and severity of involvement.',
          table: {
            headers: ['Step', 'Severity', 'Treatment'],
            rows: [
              ['Step 1', 'Mild', 'Emollients + mild TCS (face/flexures)'],
              ['Step 2', 'Moderate', 'Moderate TCS + TCI (face/flexures)'],
              ['Step 3', 'Moderate-Severe', 'Phototherapy (NB-UVB) + wet wraps'],
              ['Step 4', 'Severe', 'Dupilumab / systemic immunosuppression']
            ]
          }
        },
        {
          heading: 'Novel Targeted Therapies',
          text: 'Dupilumab, a monoclonal antibody targeting IL-4Rα (blocking both IL-4 and IL-13 signalling), has demonstrated remarkable efficacy in moderate-to-severe AD with an IGA 0/1 response in ~40% of patients. JAK inhibitors (abrocitinib, upadacitinib, baricitinib) offer additional oral alternatives, with rapid onset of pruritus relief — a clinically meaningful advantage for severely pruritic patients.'
        },
        {
          heading: 'Patient Education & Trigger Avoidance',
          text: 'Identifying and avoiding individual triggers is a key management pillar. Common triggers include extremes of temperature, certain soaps and detergents, synthetic fabrics, stress, and specific foods (particularly in children). Structured written action plans improve adherence and reduce emergency consultations by up to 40% in clinical trials.',
          bullets: [
            'Apply emollient at least 2-3 times daily, including after bathing',
            'Use soap substitutes — avoid sodium lauryl sulphate-containing products',
            'Keep fingernails short — minimises excoriation damage',
            'Oral antihistamines have limited evidence for pruritus control in AD',
            'Wet wrapping with diluted TCS is effective for acute flares'
          ]
        }
      ]
    }
  },

  // MCQs
  quizzes: {
    'mq1': {
      title: 'Module 1 Assessment',
      subtitle: 'Dermatology Fundamentals',
      totalQuestions: 10,
      passingScore: 70,
      questions: [
        {
          id: 'q1',
          question: 'Which cytokine axis is primarily responsible for the pathogenesis of psoriasis?',
          options: ['IL-4/IL-13 axis', 'IL-23/Th17 axis', 'IL-6/JAK-STAT axis', 'TNF-α/NF-κB axis'],
          correct: 1,
          explanation: 'The IL-23/Th17 axis drives psoriasis pathogenesis. IL-23 from dendritic cells promotes Th17 differentiation, which secretes IL-17A, IL-17F, and IL-22 — driving keratinocyte proliferation and inflammation.'
        },
        {
          id: 'q2',
          question: 'A 45-year-old patient presents with well-demarcated erythematous plaques on the elbows and knees with silvery scaling. BSA is 12% and PASI is 14. What is the appropriate treatment escalation?',
          options: ['Potent topical corticosteroids only', 'Conventional systemic therapy or phototherapy', 'Immediate biologic initiation', 'Emollients and mild TCS'],
          correct: 1,
          explanation: 'With BSA >10% and PASI >10, this is moderate-to-severe psoriasis. BAD guidelines recommend escalation to phototherapy or conventional systemic agents (methotrexate, cyclosporine) at this stage before biologics.'
        },
        {
          id: 'q3',
          question: 'Which vehicle formulation provides the greatest drug penetration for a dry, scaly plaque on the elbow?',
          options: ['Lotion', 'Cream', 'Gel', 'Ointment'],
          correct: 3,
          explanation: 'Ointments provide the greatest skin penetration due to their occlusive nature, making them ideal for thick, dry, scaly lesions such as psoriatic plaques on the elbows.'
        },
        {
          id: 'q4',
          question: 'In atopic dermatitis, which genetic mutation represents the strongest risk factor?',
          options: ['STAT6 mutation', 'FLG (filaggrin) mutation', 'IL-4Rα mutation', 'SPINK5 mutation'],
          correct: 1,
          explanation: 'Filaggrin (FLG) gene mutations are the strongest genetic risk factor for atopic dermatitis, leading to impaired epidermal barrier function, increased transepidermal water loss, and enhanced allergen penetration.'
        },
        {
          id: 'q5',
          question: 'The ABCDE rule for pigmented lesion assessment: what does "E" stand for?',
          options: ['Elevation', 'Erythema', 'Evolution', 'Extent'],
          correct: 2,
          explanation: '"E" in the ABCDE rule stands for Evolution — any change in size, shape, colour, or symptoms (bleeding, crusting, itching) over time is a red flag requiring urgent dermatological evaluation.'
        },
        {
          id: 'q6',
          question: 'Dupilumab\'s mechanism of action in atopic dermatitis involves targeting which receptor?',
          options: ['IL-17 receptor', 'IL-23 p19 subunit', 'IL-4Rα (blocking IL-4 and IL-13)', 'JAK1/2 kinase'],
          correct: 2,
          explanation: 'Dupilumab is a monoclonal antibody targeting the IL-4Rα subunit, which blocks signalling of both IL-4 and IL-13 — the key Th2 cytokines driving atopic dermatitis pathogenesis.'
        },
        {
          id: 'q7',
          question: 'Which condition is classified as a secondary skin lesion?',
          options: ['Vesicle', 'Pustule', 'Lichenification', 'Wheal'],
          correct: 2,
          explanation: 'Lichenification is a secondary lesion that develops from primary lesions as a result of chronic rubbing or scratching. Primary lesions (vesicle, pustule, wheal) arise on previously normal skin.'
        },
        {
          id: 'q8',
          question: 'Koebner phenomenon is characteristically associated with which condition?',
          options: ['Rosacea', 'Atopic dermatitis', 'Psoriasis', 'Urticaria'],
          correct: 2,
          explanation: 'Koebner phenomenon — the development of psoriatic lesions at sites of cutaneous trauma — is a hallmark feature of psoriasis. It is important to consider when planning procedures in psoriatic patients.'
        },
        {
          id: 'q9',
          question: 'For moderate-to-severe atopic dermatitis, which JAK inhibitor demonstrates rapid pruritus relief as a key clinical advantage?',
          options: ['Baricitinib only', 'All JAK inhibitors (abrocitinib, upadacitinib, baricitinib)', 'Ruxolitinib topical only', 'Tofacitinib'],
          correct: 1,
          explanation: 'All approved JAK inhibitors for AD (abrocitinib, upadacitinib, baricitinib) demonstrate rapid antipruritic effects, often within 1-2 weeks — a clinically significant advantage over biologics for severely pruritic patients.'
        },
        {
          id: 'q10',
          question: 'According to BAD guidelines, what BSA and PASI threshold defines moderate-to-severe psoriasis?',
          options: ['BSA ≥5% or PASI ≥5', 'BSA ≥10% or PASI ≥10 with DLQI ≥10', 'BSA ≥15% and PASI ≥15', 'Any PASI score with nail involvement'],
          correct: 1,
          explanation: 'BAD guidelines define moderate-to-severe psoriasis as BSA ≥10% OR PASI ≥10 combined with DLQI ≥10 (indicating significant quality of life impact). This threshold guides escalation to systemic or biologic therapy.'
        }
      ]
    }
  },

  stateCities: {
    'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Nashik'],
    'Delhi': ['New Delhi', 'Dwarka', 'Rohini'],
    'Karnataka': ['Bangalore', 'Mysore', 'Mangalore'],
    'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara'],
    'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai'],
    'Kerala': ['Kochi', 'Thiruvananthapuram', 'Kozhikode'],
    'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur'],
    'Punjab': ['Chandigarh', 'Ludhiana', 'Amritsar'],
    'West Bengal': ['Kolkata', 'Howrah', 'Durgapur']
  }
};