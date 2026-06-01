import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "teuchos-v3";
const API_URL = "http://localhost:8000"; // local back/ API (Supabase-backed)
const JSON_H = { "Content-Type": "application/json" };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ═══════════════════════════════════════════════════════════
   TEMPLATES
   ═══════════════════════════════════════════════════════════ */
const TEMPLATES = [
  {
    id: "residential-full", name: "Κατοικίες — Πλήρες", icon: "🏠",
    desc: "14 ενότητες: χωματουργικά → είδη υγιεινής. Βασισμένο στη δομή Pure Habitat.",
    cat: "residential",
    sections: [
      { name: "1. Χωματουργικά", items: [
        { d: "Γενική εκσκαφή θεμελίωσης — γαιώδη/ημιβραχώδη, βάθος κατά μελέτη", u: "m³", p: 14 },
        { d: "Εκσκαφή σε βραχώδη εδάφη (αν απαιτηθεί)", u: "m³", p: 28 },
        { d: "Διαμόρφωση / εξυγίανση εδάφους — αποκατάσταση πρανών", u: "m³", p: 15 },
        { d: "Μεταφορά πλεοναζόντων προϊόντων εκσκαφής σε χωματερή", u: "m³", p: 10 },
        { d: "Επίχωση με κατάλληλα προϊόντα εκσκαφής — συμπύκνωση", u: "m³", p: 8 },
      ]},
      { name: "2. Σκυρόδεμα", items: [
        { d: "Σκυρόδεμα καθαριότητας C12/15 (πάχος 10cm) — υλικό + εργασία", u: "m²", p: 14 },
        { d: "Ξυλότυποι (ξύλινα καλούπια) — κατασκευή + αποξήλωση", u: "m²", p: 22 },
        { d: "Χάλυβας οπλισμού B500C — πλέγματα, ράβδοι, υλικό + τοποθέτηση", u: "kg", p: 1.40 },
        { d: "Έτοιμο σκυρόδεμα C25/30 + πρόσμικτα στεγανοποίησης — προμήθεια", u: "m³", p: 62 },
        { d: "Άντληση σκυροδέματος (πρέσα μπετόν)", u: "m³", p: 12 },
        { d: "Δόνηση / συμπύκνωση σκυροδέματος + συντήρηση 7 ημερών", u: "m³", p: 8 },
        { d: "Οπλισμένο σκυρόδεμα πλήρες (μπετόν + σίδερα + καλούπια + εργασία)", u: "m³", p: 320 },
      ]},
      { name: "3. Τοιχοποιία", items: [
        { d: "Εξωτερική διπλή τοιχοποιία τούβλο (13×19×9) — υλικά + εργασία", u: "m²", p: 40 },
        { d: "Εσωτερική μονή τοιχοποιία τούβλο (19×19×9) πλαγιαστά", u: "m²", p: 25 },
        { d: "Πέτρινη τοιχοποιία εξωτερική (σε επιλεγμένα σημεία)", u: "m²", p: 75 },
        { d: "Σενάζ μεσοτοιχίας — Ο/Σ δοκός μέσου ύψους τοίχου", u: "m", p: 25 },
        { d: "Σενάζ πλάκας σκάλας / μπαλκονιού", u: "m", p: 28 },
        { d: "Σοβάτισμα τοίχων (τριφτό/πατητό) — εσωτερικό", u: "m²", p: 12 },
        { d: "Σοβάτισμα τοίχων — εξωτερικό (πεταχτό + τριφτό)", u: "m²", p: 14 },
      ]},
      { name: "4. Ξηρά Δόμηση (Γυψοσανίδες)", items: [
        // Α. Εσωτερικά Χωρίσματα
        { d: "Χώρισμα μονή γυψοσανίδα (1+1) + πετροβάμβακας 5cm — μεταλλικός σκελετός, στοκάρισμα 2 στρώσεων", u: "m²", p: 24 },
        { d: "Χώρισμα διπλή γυψοσανίδα (2+2) + πετροβάμβακας 5cm — ενισχυμένη ηχομόνωση/αντοχή", u: "m²", p: 36 },
        { d: "Χώρισμα WC — ανθυγρή γυψοσανίδα (Κ+Α) + πετροβάμβακας", u: "m²", p: 28 },
        { d: "Χώρισμα WC ενισχυμένο (Κ+Α+1Α) — διπλή στρώση ανθυγρή + κανονική + πετροβάμβακας", u: "m²", p: 33 },
        // Β. Ψευδοροφές
        { d: "Ψευδοροφή ευθύγραμμη — απλή γυψοσανίδα, μεταλλικός σκελετός, στοκάρισμα", u: "m²", p: 23 },
        { d: "Ψευδοροφή ανθυγρή (μπάνια/WC) — ανθυγρή γυψοσανίδα σε μεταλλικό σκελετό", u: "m²", p: 28 },
        { d: "Ψευδοροφή με σχέδιο / κρυφό φωτισμό (σαλόνι, τραπεζαρία)", u: "m²", p: 40 },
        { d: "Κρυφός φωτισμός — γύψινο πηγάδι (κατά μήκος)", u: "m", p: 25 },
        { d: "Ψευδοροφή ορυκτής ίνας 60×60cm (κοινόχρηστοι/αποθήκες)", u: "m²", p: 25 },
        // Γ. Επενδύσεις Τοίχων
        { d: "Επένδυση εσωτ. τοίχου γυψοσανίδα + σκελετός (εξομάλυνση, χωρίς μόνωση)", u: "m²", p: 20 },
        { d: "Επένδυση εσωτ. τοίχου + πετροβάμβακας 5cm (εσωτερική θερμομόνωση)", u: "m²", p: 26 },
        { d: "Επένδυση τοίχων WC ανθυγρή (Κ+1Α) — υπόστρωμα πλακιδίων", u: "m²", p: 29 },
        // Δ. Εξωτερικές Εφαρμογές
        { d: "Τσιμεντοσανίδα εξωτερική Aquapanel Outdoor + μεταλλικός σκελετός + στοκάρισμα", u: "m²", p: 45 },
        { d: "Διακοσμητικά αρχιτεκτονικά στοιχεία εξωτερικά (γυψοσανίδα + μόνωση)", u: "m²", p: 45 },
        // Ε. Λοιπές Εργασίες
        { d: "Αρμολόγηση / στοκάρισμα επιπλέον (2 στρώσεις, όπου δεν περιλαμβάνεται)", u: "m²", p: 5 },
        { d: "Θυρίδες επίσκεψης (access panels) Η/Μ εγκαταστάσεων", u: "pcs", p: 25 },
        { d: "Ενίσχυση στήριξης βαρέων αντικειμένων (ξύλινο πλαίσιο / OSB ένθετο)", u: "σημ.", p: 35 },
        { d: "Γωνιόκρανα αλουμινίου σε ακμές χωρισμάτων", u: "m", p: 4 },
        { d: "Ακουστική ταινία περιμέτρου (αντικραδασμική) σε δάπεδο/οροφή", u: "m", p: 2 },
      ]},
      { name: "5. Εξωτερική Θερμομόνωση (ETICS)", items: [
        { d: "Κολλητική μάζα θερμομόνωσης επί υποστρώματος", u: "m²", p: 5 },
        { d: "Πλάκες EPS διογκωμένης πολυστερίνης 100×60cm, πάχος 5cm", u: "m²", p: 7 },
        { d: "Πλαστικά βύσματα στήριξης (5–6 τεμ/m²)", u: "m²", p: 2 },
        { d: "Ελαστικός σοβάς + πλέγμα υαλοϋφάσματος (αντιρηγματικός)", u: "m²", p: 8 },
        { d: "Τελικός ακρυλικός σοβάς χρωματιστός (θερμοπαστάλ)", u: "m²", p: 10 },
        { d: "Γωνιόκρανα αλουμινίου / νεροσταλάκτες σε ακμές", u: "m", p: 4 },
        { d: "Πλήρες σύστημα ETICS κατ' αποκοπή (αν δεν αναλυθεί)", u: "m²", p: 42 },
      ]},
      { name: "6. Πλακίδια — Μάρμαρα", items: [
        { d: "Τσιμεντοκονία ισοπέδωσης 8–10cm (υπόστρωμα δαπέδου)", u: "m²", p: 14 },
        { d: "Τοποθέτηση πλακιδίων δαπέδου εσωτ. 90×120cm (εργατικά + κόλλες)", u: "m²", p: 18 },
        { d: "Τοποθέτηση πλακιδίων δαπέδου εξωτ. (βεράντες/ταράτσες)", u: "m²", p: 20 },
        { d: "Τοποθέτηση πλακιδίων τοίχων WC (εργατικά + κόλλες)", u: "m²", p: 18 },
        { d: "Σοβατεπί ύψους 7cm — τοποθέτηση", u: "m", p: 3 },
        { d: "Περβάζια παραθύρων (μάρμαρο/πλακίδιο) — εσωτ. & εξωτ.", u: "m", p: 8 },
        { d: "Μάρμαρα σκαλοπατιών (πατήματα + ρίχτια)", u: "m", p: 15 },
        { d: "Κυβόλιθοι parking (200×100×60mm) — υλικό + τοποθέτηση", u: "m²", p: 11 },
        { d: "Αρμολόγηση πλακιδίων (στόκος/φούγκα)", u: "m²", p: 3 },
      ]},
      { name: "7. Χρωματισμοί", items: [
        { d: "Αστάρωμα εσωτερικών τοίχων (αντιμουχλικό/σταθεροποιητικό)", u: "m²", p: 2 },
        { d: "Σπατουλάρισμα εσωτερικών τοίχων & οροφών (2–3 στρώσεις)", u: "m²", p: 7 },
        { d: "Βαφή εσωτερική — πλαστικό χρώμα 2 στρώσεις (υλικά + εργασία)", u: "m²", p: 5 },
        { d: "Πλήρης εσωτερικός χρωματισμός (αστάρι + σπατουλάρισμα + βαφή)", u: "m²", p: 12 },
        { d: "Αστάρωμα εξωτερικών τοίχων (σταθεροποιητικό)", u: "m²", p: 2 },
        { d: "Βαφή εξωτερική — ακρυλικό χρώμα 2 στρώσεις (υλικά + εργασία)", u: "m²", p: 7 },
        { d: "Πλήρης εξωτερικός χρωματισμός (αστάρι + 2 ακρυλικές στρώσεις)", u: "m²", p: 14 },
      ]},
      { name: "8. Στεγανοποίηση — Μονώσεις", items: [
        { d: "Στεγανοποίηση θεμελίωσης — ασφαλτικό αστάρι + ασφαλτόπανο 2 στρώσεις", u: "m²", p: 18 },
        { d: "Προστατευτικό σκυρόδεμα επί στεγανοποίησης θεμελίωσης", u: "m²", p: 8 },
        { d: "Στεγανοποίηση πλάκας — ασφαλτόπανο 2 στρώσεις", u: "m²", p: 18 },
        { d: "Θερμομονωτική πλάκα XPS/Dow 5cm (επί πλάκας)", u: "m²", p: 8 },
        { d: "Ελαφροσκυρόδεμα ρύσεων INTERFILL (ταράτσα/δώμα)", u: "m³", p: 110 },
        { d: "Πολυουρεθανική στεγανοποίηση μπαλκονιών (επαλειφόμενη)", u: "m²", p: 22 },
        { d: "Τσιμεντοειδής στεγανοποίηση υγρών χώρων (WC τοίχοι/δάπεδα)", u: "m²", p: 15 },
        { d: "Υγρομόνωση + θερμομόνωση ταράτσας πλήρες σύστημα", u: "m²", p: 42 },
      ]},
      { name: "9. Ύδρευση — Αποχέτευση — Αποστράγγιση", items: [
        { d: "Σημεία ύδρευσης (σωλήνες Φ16/Φ18 πολυστρωματικοί, blue/red)", u: "σημ.", p: 110 },
        { d: "Σημεία αποχέτευσης (σωλήνες PVC ≤Φ160, σύνδεση φρεατίων)", u: "σημ.", p: 90 },
        { d: "Πίνακας υδροληψίας ανά διαμέρισμα (collector + βαλβίδα)", u: "pcs", p: 180 },
        { d: "Αποχέτευση ομβρίων Φ100 περιμετρικά θεμελίωσης", u: "m", p: 12 },
        { d: "Φρεάτια επίσκεψης αποχέτευσης", u: "pcs", p: 120 },
        { d: "Σιφώνια δαπέδου WC & βοηθητικών χώρων", u: "pcs", p: 25 },
        { d: "Σωληνώσεις αποχέτευσης κλιματιστικών Φ100 (οροφή→έδαφος)", u: "m", p: 10 },
        { d: "Εγκατάσταση ανοξείδωτου νεροχύτη (υγιεινός, προσβάσιμος)", u: "pcs", p: 80 },
      ]},
      { name: "10. Ηλεκτρολογικά", items: [
        { d: "Ηλεκτρολογική εγκατάσταση ισχυρών ρευμάτων — Type A (88m²)", u: "κατ.", p: 10300 },
        { d: "Ηλεκτρολογική εγκατάσταση ισχυρών ρευμάτων — Type B (105m²)", u: "κατ.", p: 11300 },
        { d: "Ασθενή ρεύματα (UTP, τηλεφωνία, θυροτηλεόραση, TV)", u: "κατ.", p: 800 },
        { d: "Διακόπτες / πρίζες Vimar Neve Up — Type A (88m²)", u: "κατ.", p: 1500 },
        { d: "Διακόπτες / πρίζες Vimar Neve Up — Type B (105m²)", u: "κατ.", p: 2200 },
        { d: "ΥΔΕ — Υπεύθυνη Δήλωση Εγκαταστάτη", u: "pcs", p: 0 },
        { d: "Γείωση θεμελίωσης (ELOT HD 384)", u: "κατ.", p: 350 },
        { d: "Αντικεραυνική προστασία (αλεξικέραυνο + αγωγός)", u: "κατ.", p: 500 },
      ]},
      { name: "11. Κλιματισμός — Ηλιακά", items: [
        { d: "Προεγκατάσταση A/C — χαλκοσωλήνες + αποχέτευση συμπυκνωμάτων (ανά σημείο)", u: "σημ.", p: 180 },
        { d: "Μονάδα A/C 9.000 BTU TCL — προμήθεια", u: "pcs", p: 400 },
        { d: "Μονάδα A/C 9.000 BTU — εγκατάσταση", u: "pcs", p: 70 },
        { d: "Μονάδα A/C 19.000 BTU TCL — προμήθεια", u: "pcs", p: 450 },
        { d: "Μονάδα A/C 19.000 BTU — εγκατάσταση", u: "pcs", p: 70 },
        { d: "Ηλιακός θερμοσίφωνας 160lt Calpak Neo (με boiler) — προμήθεια + εγκατάσταση", u: "pcs", p: 900 },
      ]},
      { name: "12. Κουφώματα Αλουμινίου", items: [
        { d: "Μονόφυλλη πόρτα εισόδου 2.30×1.00m — EUROPA EOS 60/ESS 34 TH", u: "pcs", p: 1438 },
        { d: "Μονόφυλλο ανοιγόμενο παράθυρο (μικρό WC) — EUROPA", u: "pcs", p: 420 },
        { d: "Δίφυλλο συρόμενο + σίτα 2.30×1.80m — EUROPA", u: "pcs", p: 1510 },
        { d: "Δίφυλλο συρόμενο + σίτα 2.50×2.00m — EUROPA", u: "pcs", p: 1670 },
        { d: "Σταθερό πάνελ (φεγγίτης) 2.30–2.50×0.80m — EUROPA", u: "pcs", p: 470 },
        { d: "Ρολό θερμοδιακοπής με ιμάντα (ανά κούφωμα)", u: "pcs", p: 380 },
        { d: "Κουφώματα αλουμινίου γενικά (μέση τιμή ανά m²)", u: "m²", p: 320 },
      ]},
      { name: "13. Ξυλουργικά", items: [
        { d: "Πάγκος κουζίνας (laminate ή αντίστοιχο) — κατασκευή + τοποθέτηση", u: "m", p: 120 },
        { d: "Ντουλάπια κουζίνας (πάνω + κάτω) — κατασκευή + τοποθέτηση", u: "m", p: 350 },
        { d: "Ντουλάπες υπνοδωματίων (ανοιγόμενες) — κατασκευή + τοποθέτηση", u: "m", p: 400 },
        { d: "Μηχανισμός ρυθμιζόμενου ύψους για γραφείο", u: "pcs", p: 50 },
        { d: "Εσωτερικές πόρτες MDF με κάσα + χερούλι", u: "pcs", p: 380 },
        { d: "Έπιπλο μπάνιου (νιπτήρας + συρτάρι)", u: "pcs", p: 180 },
      ]},
      { name: "14. Είδη Υγιεινής", items: [
        { d: "Λεκάνη WC (κρεμαστή ή δαπέδου)", u: "pcs", p: 95 },
        { d: "Νιπτήρας με overflow", u: "pcs", p: 90 },
        { d: "Καζανάκι εντοιχιζόμενο (concealed)", u: "pcs", p: 100 },
        { d: "Στήλη ντους (external shower column)", u: "pcs", p: 950 },
        { d: "Μπαταρία νιπτήρα (mixer tap)", u: "pcs", p: 97 },
        { d: "Καθρέπτης LED στρογγυλός Ø80", u: "pcs", p: 80 },
        { d: "Γραμμικό σιφώνι ντους 60cm (linear drain)", u: "pcs", p: 48 },
        { d: "Σιφώνι δαπέδου 15×15cm με πλακίδιο", u: "pcs", p: 13 },
        { d: "Σταθεροποιητής ντους γυάλινος (crossbar)", u: "pcs", p: 140 },
        { d: "Διπλός γάντζος πετσετών", u: "pcs", p: 12 },
        { d: "Χαρτοθήκη WC", u: "pcs", p: 12 },
        { d: "Κρεμάστρα πετσετών (ράγα)", u: "pcs", p: 28 },
      ]},
    ]
  },
  {
    id: "residential-pools", name: "Κατοικίες + Πισίνες", icon: "🏊", cat: "residential",
    desc: "Πλήρες τεύχος με πισίνες (στεγανοποίηση, μηχανοστάσιο, επενδύσεις)",
    sections: [
      { name: "1. Χωματουργικά", items: [{ d: "Γενική εκσκαφή", u: "m³" }] },
      { name: "2. Σκυρόδεμα", items: [{ d: "C25/30", u: "m³" }] },
      { name: "3–8. Οικοδομικές (κατ' αποκοπή)", items: [{ d: "Τοιχοποιία/Ξηρά/Θερμομ./Πλακίδια/Χρώματα/Στεγαν.", u: "€" }] },
      { name: "9. Ύδρευση — Αποχέτευση", items: [{ d: "Πλήρης εγκατάσταση", u: "κατ." }] },
      { name: "10. Πισίνες — Κατασκευή", items: [
        { d: "Στεγανοποίηση (ασφαλτόπανο 2×)", u: "m²" }, { d: "Water stop", u: "m" },
        { d: "Σωληνώσεις PVC 10atm", u: "σετ" }, { d: "Μηχανοστάσιο πλήρες", u: "σετ" }
      ]},
      { name: "11. Πισίνες — Επενδύσεις", items: [
        { d: "Coping (μάρμαρο)", u: "m²", p: 70 }, { d: "Backsplash γυαλί", u: "m²", p: 30 },
        { d: "Σκαλοπάτια μάρμαρο", u: "m²", p: 70 }, { d: "Πλακίδια pool (60×120)", u: "m²", p: 23 }
      ]},
      { name: "12. Κλιματισμός / Ηλιακά", items: [{ d: "A/C + εγκατάσταση", u: "pcs" }, { d: "Ηλιακοί", u: "pcs" }] },
      { name: "13. Κουφώματα / Ηλεκτρ.", items: [{ d: "Αλουμίνια EUROPA", u: "m²" }, { d: "Ηλεκτρολογικά", u: "κατ." }] },
    ]
  },
  { id: "hotel", name: "Ξενοδοχείο Ανακαίνιση", icon: "🏨", cat: "hospitality",
    desc: "Δωμάτια, κοινόχρηστοι, F&B, Η/Μ",
    sections: [
      { name: "1. Αποξηλώσεις", items: [{ d: "Δάπεδα", u: "m²" }, { d: "Τοιχοποιίες", u: "m²" }, { d: "Μπάζα", u: "m³" }] },
      { name: "2. Δωμάτια", items: [{ d: "Δάπεδα", u: "m²" }, { d: "Μπάνια πλακίδια", u: "m²" }, { d: "Χρωματισμοί", u: "m²" }, { d: "Υδραυλικά/δωμ.", u: "δωμ." }, { d: "Είδη υγιεινής/σετ", u: "δωμ." }] },
      { name: "3. Κοινόχρηστοι", items: [{ d: "Lobby", u: "m²" }, { d: "Διάδρομοι", u: "m²" }] },
      { name: "4. F&B", items: [{ d: "Εστιατόριο/Bar", u: "m²" }, { d: "Κουζίνα", u: "σετ" }] },
      { name: "5. Η/Μ", items: [{ d: "VRV/VRF κλιματισμός", u: "kW" }, { d: "Πυρανίχνευση", u: "σετ" }] },
    ]
  },
  { id: "blank", name: "Κενό Template", icon: "📄", cat: "other", desc: "Ξεκίνα από μηδέν", sections: [] },
];

const UNITS = ["pcs","m","m²","m³","kg","lt","hrs","days","σετ","σημ.","κατ.","δωμ.","lm","kW","€"];
const fmt = (n) => new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(n);
const fN = (n) => new Intl.NumberFormat("el-GR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);

const mkOffer = (t, name) => ({
  id: uid(), name: name||t.name, client:"", project:"", date: new Date().toISOString().split("T")[0],
  companyName:"", companyAddr:"", companyWeb:"", logo:"",
  numUnits: 1, islandSurcharge: false, vatRate: 24,
  sections: t.sections.map(s=>({ id:uid(), name:s.name, collapsed:false, note:"",
    items: s.items.map(i=>({ id:uid(), description:i.d, quantity:0, unit:i.u||"pcs", unitPrice:i.p||0, notes:"" }))
  })), createdAt:Date.now(), updatedAt:Date.now()
});

/* ═══════════════════════════════════════════════════════════
   ICONS
   ═══════════════════════════════════════════════════════════ */
const I=({d,s=18,...p})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d={d}/></svg>;

/* ═══════════════════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════════════════ */
export default function App(){
  const[data,setData]=useState({offers:[],custom:[]});
  const[view,setView]=useState("list");
  const[aid,setAid]=useState(null);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[toast,setToast]=useState(null);
  const[preview,setPreview]=useState(null);
  const[compareIds,setCompareIds]=useState([]);
  const sRef=useRef(null);
  const[cloud,setCloud]=useState("");      // Supabase sync indicator
  const cloudIdRef=useRef({});             // local offer id -> Supabase offer id
  const cloudRef=useRef(null);

  useEffect(()=>{(async()=>{try{const r=await window.storage.get(STORAGE_KEY);if(r?.value)setData(JSON.parse(r.value));}catch{}setLoading(false);})();},[]);

  const persist=useCallback((d)=>{if(sRef.current)clearTimeout(sRef.current);sRef.current=setTimeout(async()=>{setSaving(true);try{await window.storage.set(STORAGE_KEY,JSON.stringify(d));flash("✓ Αποθηκεύτηκε");}catch{flash("Σφάλμα!",1);}finally{setSaving(false);}},600);},[]);

  const flash=(m,e)=>{setToast({m,e});setTimeout(()=>setToast(null),2000);};
  const up=fn=>{const nd=fn(data);setData(nd);persist(nd);};
  const offer=data.offers.find(o=>o.id===aid);
  const uO=fn=>up(d=>({...d,offers:d.offers.map(o=>o.id===aid?{...fn(o),updatedAt:Date.now()}:o)}));

  const create=(t,n)=>{const o=mkOffer(t,n);up(d=>({...d,offers:[...d.offers,o]}));setAid(o.id);setView("edit");};
  const dup=id=>{const s=data.offers.find(o=>o.id===id);if(!s)return;const c=JSON.parse(JSON.stringify(s));c.id=uid();c.name+=" (copy)";c.createdAt=c.updatedAt=Date.now();c.sections.forEach(s=>{s.id=uid();s.items.forEach(i=>{i.id=uid();});});up(d=>({...d,offers:[...d.offers,c]}));flash("Αντιγράφηκε!");};
  const del=id=>{up(d=>({...d,offers:d.offers.filter(o=>o.id!==id)}));if(aid===id){setAid(null);setView("list");}};
  const saveTmpl=o=>{const t={id:"c-"+uid(),name:o.name+" (tmpl)",icon:"⭐",cat:"custom",desc:"Custom",sections:o.sections.map(s=>({name:s.name,items:s.items.map(i=>({d:i.description,u:i.unit,p:i.unitPrice}))}))};up(d=>({...d,custom:[...d.custom,t]}));flash("Template saved!");};

  const addSec=()=>uO(o=>({...o,sections:[...o.sections,{id:uid(),name:"Νέα Ενότητα "+(o.sections.length+1),collapsed:false,note:"",items:[]}]}));
  const uSec=(sid,u)=>uO(o=>({...o,sections:o.sections.map(s=>s.id===sid?{...s,...u}:s)}));
  const dSec=sid=>uO(o=>({...o,sections:o.sections.filter(s=>s.id!==sid)}));
  const addIt=sid=>uO(o=>({...o,sections:o.sections.map(s=>s.id===sid?{...s,items:[...s.items,{id:uid(),description:"",quantity:0,unit:"pcs",unitPrice:0,notes:""}]}:s)}));
  const uIt=(sid,iid,u)=>uO(o=>({...o,sections:o.sections.map(s=>s.id===sid?{...s,items:s.items.map(i=>i.id===iid?{...i,...u}:i)}:s)}));
  const dIt=(sid,iid)=>uO(o=>({...o,sections:o.sections.map(s=>s.id===sid?{...s,items:s.items.filter(i=>i.id!==iid)}:s)}));

  const sT=s=>s.items.reduce((a,i)=>a+(i.quantity||0)*(i.unitPrice||0),0);
  const oT=o=>(o?.sections||[]).reduce((a,s)=>a+sT(s),0);
  const allT=[...TEMPLATES,...(data.custom||[])];

  // ── Cloud sync (Supabase via back/ API) — best-effort, offline-safe ──
  const cloudPush=async()=>{
    if(!aid) return;
    const o=data.offers.find(x=>x.id===aid);
    if(!o) return;
    const content={sections:(o.sections||[]).map(s=>({name:s.name,note:s.note||null,
      items:(s.items||[]).map(i=>({description:i.description||"",quantity:i.quantity||0,unit:i.unit||"pcs",unit_price:i.unitPrice||0}))}))};
    const meta={name:o.name,client:o.client||null,project_name:o.project||null,offer_date:o.date||null,vat_rate:o.vatRate??24,
      company:{name:o.companyName||"",address:o.companyAddr||"",web:o.companyWeb||""}};
    try{
      let cid=cloudIdRef.current[o.id];
      if(!cid){const r=await fetch(API_URL+"/offers",{method:"POST",headers:JSON_H,body:JSON.stringify({name:o.name})});if(!r.ok)throw 0;cid=(await r.json()).id;cloudIdRef.current[o.id]=cid;}
      await fetch(API_URL+"/offers/"+cid,{method:"PUT",headers:JSON_H,body:JSON.stringify(meta)});
      await fetch(API_URL+"/offers/"+cid+"/content",{method:"PUT",headers:JSON_H,body:JSON.stringify(content)});
      setCloud("☁️ συγχρονίστηκε");
    }catch{setCloud("☁️ offline");}
    setTimeout(()=>setCloud(""),3000);
  };
  const cloudLoad=async()=>{
    try{
      const r=await fetch(API_URL+"/offers");if(!r.ok)throw 0;
      const list=await r.json();
      const known=new Set(Object.values(cloudIdRef.current));
      const imported=[];
      for(const c of list){
        if(known.has(c.id))continue;
        const fr=await fetch(API_URL+"/offers/"+c.id);if(!fr.ok)continue;
        const full=await fr.json();
        const lid=uid();cloudIdRef.current[lid]=c.id;
        imported.push({id:lid,name:(full.name||"Offer")+" (cloud)",client:full.client||"",project:full.project_name||"",date:full.offer_date||"",
          sections:(full.sections||[]).map(s=>({id:uid(),name:s.name,collapsed:false,note:s.note||"",
            items:(s.items||[]).map(i=>({id:uid(),description:i.description,quantity:Number(i.quantity)||0,unit:i.unit||"pcs",unitPrice:Number(i.unit_price)||0,notes:""}))})),
          createdAt:Date.now(),updatedAt:Date.now()});
      }
      if(imported.length)up(d=>({...d,offers:[...d.offers,...imported]}));
      setCloud("☁️ "+imported.length+" από cloud");
    }catch{setCloud("☁️ offline");}
    setTimeout(()=>setCloud(""),3000);
  };
  useEffect(()=>{if(loading||!aid)return;if(cloudRef.current)clearTimeout(cloudRef.current);cloudRef.current=setTimeout(()=>cloudPush(),1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[data,aid]);

  if(loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#f5f0e8",fontFamily:"'Cormorant Garamond',serif"}}>
      <p style={{color:"#8B7355",fontSize:18}}>Φόρτωση...</p>
    </div>
  );

  return(
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#f5f0e8",minHeight:"100vh",color:"#3a3028"}}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        input:focus,select:focus,textarea:focus{border-color:#8B7355!important;background:rgba(139,115,85,0.04)!important}
        .hcard:hover{border-color:#8B7355!important;transform:translateY(-2px);box-shadow:0 8px 30px rgba(139,115,85,0.12)!important}
        tr:hover td{background:rgba(139,115,85,0.03)}
        ::selection{background:#8B7355;color:#fff}
        @media print{header,button,.no-print{display:none!important}main{padding:0!important;max-width:100%!important}body,html{background:#fff!important}}
      `}</style>

      {toast&&<div style={{position:"fixed",top:16,right:16,zIndex:9999,padding:"8px 20px",borderRadius:8,color:"#fff",fontWeight:600,fontSize:13,background:toast.e?"#c0392b":"#27ae60",animation:"fadeIn .2s",fontFamily:"'DM Sans',sans-serif"}}>{toast.m}</div>}

      {/* HEADER */}
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 28px",background:"#3a3028",borderBottom:"3px solid #8B7355"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:40,height:40,borderRadius:10,background:"#8B7355",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Cormorant Garamond',serif",fontWeight:700,fontSize:20,color:"#f5f0e8"}}>τ</div>
          <div><h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,margin:0,color:"#f5f0e8",fontWeight:600}}>Τεύχος Builder</h1>
          <p style={{fontSize:10,margin:0,color:"#a09080",letterSpacing:1,textTransform:"uppercase"}}>Κατασκευή Προσφορών</p></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {saving&&<span style={{fontSize:10,background:"rgba(255,255,255,0.1)",padding:"4px 12px",borderRadius:20,color:"#a09080"}}>Saving...</span>}
          {cloud&&<span style={{fontSize:10,padding:"4px 12px",borderRadius:20,color:"#7fd8c0"}}>{cloud}</span>}
          <button style={B.back} onClick={cloudLoad}>☁️ Cloud</button>
          {aid&&<button style={B.back} onClick={()=>{const cid=cloudIdRef.current[aid];if(cid){window.open(API_URL+"/offers/"+cid+"/pdf","_blank");}else{setCloud("Συγχρονίζεται… ξαναδοκίμασε");setTimeout(()=>setCloud(""),3000);}}}>⬇️ PDF</button>}
          {view!=="list"&&<button style={B.back} onClick={()=>{setView("list");setPreview(null);}}>← Λίστα</button>}
        </div>
      </header>

      <main style={{maxWidth:1100,margin:"0 auto",padding:"28px 20px"}}>
        {view==="list"&&<ListV offers={data.offers} templates={allT} onCreate={create} onSelect={id=>{setAid(id);setView("edit");}} onDup={dup} onDel={del} onPreview={o=>{setPreview(o);setView("preview");}} oT={oT} onCompare={(ids)=>{setCompareIds(ids);setView("compare");}}/>}
        {view==="edit"&&offer&&<EditV offer={offer} uF={(f,v)=>uO(o=>({...o,[f]:v}))} addSec={addSec} uSec={uSec} dSec={dSec} addIt={addIt} uIt={uIt} dIt={dIt} sT={sT} oT={oT} onPrev={()=>{setPreview(offer);setView("preview");}} onTmpl={()=>saveTmpl(offer)} onCsvImport={(items,secName)=>{uO(o=>({...o,sections:[...o.sections,{id:uid(),name:secName||"Import CSV",collapsed:false,note:"Imported from CSV",items:items.map(i=>({id:uid(),...i}))}]}));flash("CSV imported!");}}/>}
        {view==="preview"&&preview&&<PrevV offer={preview} oT={oT} sT={sT} onBack={()=>setView(aid?"edit":"list")}/>}
        {view==="compare"&&<CompareV offers={data.offers.filter(o=>compareIds.includes(o.id))} sT={sT} oT={oT} onBack={()=>setView("list")}/>}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   LIST VIEW
   ═══════════════════════════════════════════════════════════ */
function ListV({offers,templates,onCreate,onSelect,onDup,onDel,onPreview,oT,onCompare}){
  const[show,setShow]=useState(false);
  const[nm,setNm]=useState("");
  const[compSel,setCompSel]=useState([]);
  const cats={residential:"Κατοικίες",hospitality:"Φιλοξενία",commercial:"Εμπορικά",custom:"Custom",other:"Λοιπά"};

  return(<div>
    {show&&<div style={B.modal} onClick={()=>setShow(false)}><div style={B.mc} onClick={e=>e.stopPropagation()}>
      <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,margin:"0 0 16px",color:"#3a3028"}}>Επιλογή Template</h2>
      <input style={B.mi} placeholder="Όνομα προσφοράς..." value={nm} onChange={e=>setNm(e.target.value)} autoFocus/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
        {templates.map(t=><button key={t.id} className="hcard" style={B.tc} onClick={()=>{onCreate(t,nm||t.name);setShow(false);setNm("");}}>
          <span style={{fontSize:28,display:"block",marginBottom:6}}>{t.icon}</span>
          <h3 style={{fontSize:14,fontWeight:700,margin:"0 0 4px",fontFamily:"'Cormorant Garamond',serif",color:"#3a3028"}}>{t.name}</h3>
          <p style={{fontSize:11,color:"#8B7355",margin:"0 0 8px",lineHeight:1.4}}>{t.desc}</p>
          <span style={{fontSize:9,background:"#f5f0e8",padding:"2px 8px",borderRadius:10,color:"#8B7355",border:"1px solid #ddd3c4"}}>{cats[t.cat]||t.cat}</span>
        </button>)}
      </div>
    </div></div>}

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
      <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:30,margin:0,color:"#3a3028"}}>Οι Προσφορές σου</h2>
      <div style={{display:"flex",gap:8}}>
        {compSel.length>=2&&<button style={B.sec2} onClick={()=>onCompare(compSel)}>⚖️ Σύγκριση ({compSel.length})</button>}
        <button style={B.prim} onClick={()=>setShow(true)}>+ Νέα Προσφορά</button>
      </div>
    </div>

    {offers.length===0?
      <div style={{textAlign:"center",padding:60,background:"#fff",borderRadius:12,border:"2px dashed #ddd3c4"}}>
        <p style={{fontSize:48,margin:"0 0 8px"}}>📋</p>
        <h3 style={{fontFamily:"'Cormorant Garamond',serif",color:"#5a4a3a",margin:"0 0 8px"}}>Κανένα τεύχος ακόμα</h3>
        <p style={{color:"#8B7355",marginBottom:20}}>Δημιούργησε μια προσφορά επιλέγοντας template.</p>
        <button style={B.prim} onClick={()=>setShow(true)}>+ Ξεκίνα</button>
      </div>
    :
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:14}}>
        {offers.map(o=><div key={o.id} className="hcard" style={B.card} onClick={()=>onSelect(o.id)}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input type="checkbox" checked={compSel.includes(o.id)} onChange={e=>{e.stopPropagation();setCompSel(p=>p.includes(o.id)?p.filter(x=>x!==o.id):[...p,o.id]);}} onClick={e=>e.stopPropagation()} style={{accentColor:"#8B7355"}}/>
              <span style={{fontSize:10,background:"#f5f0e8",padding:"2px 8px",borderRadius:12,color:"#8B7355",border:"1px solid #e8e0d4"}}>{o.sections.length} ενότητες</span>
            </div>
            <div style={{display:"flex",gap:4}}>
              <button style={B.ib} title="Preview" onClick={e=>{e.stopPropagation();onPreview(o);}}>👁</button>
              <button style={B.ib} title="Copy" onClick={e=>{e.stopPropagation();onDup(o.id);}}>📋</button>
              <button style={{...B.ib,color:"#c0392b"}} title="Delete" onClick={e=>{e.stopPropagation();onDel(o.id);}}>🗑</button>
            </div>
          </div>
          <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,margin:"0 0 4px",color:"#3a3028"}}>{o.name||"Χωρίς τίτλο"}</h3>
          <p style={{fontSize:12,color:"#8B7355",margin:0}}>{o.client||"—"} • {o.project||"—"}</p>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"1px solid #f0e8dc",paddingTop:12,marginTop:12}}>
            <span style={{fontSize:11,color:"#aaa"}}>{o.date}</span>
            <span style={{fontSize:18,fontWeight:700,color:"#5a4a3a",fontFamily:"'Cormorant Garamond',serif"}}>{fmt(oT(o))}</span>
          </div>
        </div>)}
      </div>
    }
  </div>);
}

/* ═══════════════════════════════════════════════════════════
   EDITOR VIEW
   ═══════════════════════════════════════════════════════════ */
function EditV({offer,uF,addSec,uSec,dSec,addIt,uIt,dIt,sT,oT,onPrev,onTmpl,onCsvImport}){
  const surcharge = offer.islandSurcharge ? 1.15 : 1;
  const adjTotal = oT(offer) * surcharge;
  const perUnit = offer.numUnits > 0 ? adjTotal / offer.numUnits : adjTotal;
  const csvRef = useRef();

  const handleCsv = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const lines = ev.target.result.split("\n").filter(l => l.trim());
        const items = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(/[,;\t]/);
          if (cols.length >= 2) {
            items.push({
              description: (cols[0] || "").trim(),
              quantity: parseFloat(cols[1]) || 0,
              unit: (cols[2] || "pcs").trim(),
              unitPrice: parseFloat(cols[3]) || 0,
              notes: (cols[4] || "").trim(),
            });
          }
        }
        if (items.length > 0) {
          const secName = file.name.replace(/\.(csv|tsv|txt)$/i, "");
          onCsvImport(items, secName);
        }
      } catch { alert("Σφάλμα ανάγνωσης CSV"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return(<div>
    <div style={B.meta}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 130px",gap:14}}>
        <Fd l="Τίτλος" v={offer.name} c={v=>uF("name",v)}/>
        <Fd l="Πελάτης" v={offer.client} c={v=>uF("client",v)} ph="π.χ. Jens Vanhove"/>
        <Fd l="Έργο" v={offer.project} c={v=>uF("project",v)} ph="π.χ. 14 κατοικίες"/>
        <Fd l="Ημ/νία" v={offer.date} c={v=>uF("date",v)} t="date"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginTop:14}}>
        <Fd l="Εταιρία" v={offer.companyName||""} c={v=>uF("companyName",v)} ph="Pure Habitat"/>
        <Fd l="Διεύθυνση" v={offer.companyAddr||""} c={v=>uF("companyAddr",v)} ph="32 Kodrigtónos St."/>
        <Fd l="Website" v={offer.companyWeb||""} c={v=>uF("companyWeb",v)} ph="www.purehabitat.gr"/>
      </div>
      {/* Island Surcharge + Units */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:14,marginTop:14,alignItems:"end"}}>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"#8B7355"}}>Αρ. Κατοικιών/Μονάδων</label>
          <input style={B.inp} type="number" min={1} value={offer.numUnits||1} onChange={e=>uF("numUnits",parseInt(e.target.value)||1)}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"#8B7355"}}>Προσαύξηση Νησιωτικότητας</label>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:"#5a4a3a"}}>
            <input type="checkbox" checked={!!offer.islandSurcharge} onChange={e=>uF("islandSurcharge",e.target.checked)} style={{accentColor:"#8B7355",width:18,height:18}}/>
            +15% Ρόδος / Νησιά
          </label>
        </div>
      </div>
      {/* Logo Upload */}
      <div style={{marginTop:14,display:"flex",alignItems:"center",gap:16}}>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"#8B7355"}}>Logo Εταιρίας</label>
          <label style={{display:"inline-flex",alignItems:"center",gap:6,background:"#faf8f4",border:"1px solid #ddd3c4",padding:"8px 16px",borderRadius:8,cursor:"pointer",fontSize:12,color:"#5a4a3a",fontFamily:"'DM Sans',sans-serif"}}>
            📷 {offer.logo ? "Αλλαγή Logo" : "Ανέβασμα Logo"}
            <input type="file" accept="image/*" style={{display:"none"}} onChange={(e) => {
              const file = e.target.files[0];
              if (!file) return;
              if (file.size > 500000) { alert("Μέγιστο μέγεθος 500KB"); return; }
              const reader = new FileReader();
              reader.onload = (ev) => uF("logo", ev.target.result);
              reader.readAsDataURL(file);
            }} />
          </label>
        </div>
        {offer.logo && (
          <div style={{position:"relative"}}>
            <img src={offer.logo} alt="Logo" style={{height:50,maxWidth:160,objectFit:"contain",borderRadius:6,border:"1px solid #e8e0d4"}} />
            <button onClick={()=>uF("logo","")} style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:"#c0392b",color:"#fff",border:"none",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>×</button>
          </div>
        )}
      </div>
      <div style={{display:"flex",gap:8,marginTop:16,flexWrap:"wrap"}}>
        <button style={B.sec2} onClick={onPrev}>👁 Προεπισκόπηση</button>
        <button style={B.sec2} onClick={onTmpl}>💾 Ως Template</button>
        <button style={B.sec2} onClick={()=>csvRef.current?.click()}>📥 Import CSV</button>
        <input ref={csvRef} type="file" accept=".csv,.tsv,.txt" style={{display:"none"}} onChange={handleCsv}/>
      </div>
    </div>

    {/* Grand Total + Per Unit + Surcharge */}
    <div style={{background:"#3a3028",borderRadius:12,padding:"16px 24px",marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,color:"#a09080"}}>Συνολικό Κόστος {offer.islandSurcharge?"(+15% νησί)":""}</span>
        <span style={{fontSize:28,fontFamily:"'Cormorant Garamond',serif",fontWeight:700,color:"#f5f0e8"}}>{fmt(adjTotal)}</span>
      </div>
      {offer.numUnits > 1 && (
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,paddingTop:8,borderTop:"1px solid rgba(255,255,255,0.1)"}}>
          <span style={{fontSize:11,color:"#a09080"}}>Κόστος ανά μονάδα ({offer.numUnits} μονάδες)</span>
          <span style={{fontSize:18,fontFamily:"'Cormorant Garamond',serif",fontWeight:600,color:"#ddd3c4"}}>{fmt(perUnit)}</span>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,paddingTop:8,borderTop:"1px solid rgba(255,255,255,0.1)"}}>
        <span style={{fontSize:11,color:"#a09080",display:"flex",alignItems:"center",gap:6}}>ΦΠΑ
          <input type="number" value={offer.vatRate??24} onChange={e=>uF("vatRate",parseFloat(e.target.value)||0)} style={{width:50,padding:"2px 6px",borderRadius:6,border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.08)",color:"#f5f0e8",fontSize:12}}/>%
        </span>
        <span style={{fontSize:18,fontFamily:"'Cormorant Garamond',serif",fontWeight:700,color:"#7fd8c0"}}>Με ΦΠΑ: {fmt(adjTotal*(1+(offer.vatRate??24)/100))}</span>
      </div>
    </div>

    {offer.sections.map((s,i)=><SecBlock key={s.id} s={s} i={i} u={u=>uSec(s.id,u)} rm={()=>dSec(s.id)} aI={()=>addIt(s.id)} uI={(iid,u)=>uIt(s.id,iid,u)} dI={iid=>dIt(s.id,iid)} t={sT(s)}/>)}

    <button style={{...B.prim,width:"100%",justifyContent:"center",padding:"14px 20px"}} onClick={addSec}>+ Προσθήκη Ενότητας</button>
  </div>);
}

function Fd({l,v,c,t="text",ph=""}){
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <label style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"#8B7355"}}>{l}</label>
      <input style={B.inp} type={t} value={v} onChange={e=>c(e.target.value)} placeholder={ph}/>
    </div>
  );
}

function SecBlock({s,i,u,rm,aI,uI,dI,t}){
  const[en,setEn]=useState(false);
  const r=useRef();
  useEffect(()=>{if(en&&r.current)r.current.focus();},[en]);

  return (
    <div style={{background:"#fff",borderRadius:12,marginBottom:14,border:"1px solid #e8e0d4",overflow:"hidden"}}>
    <div style={{display:"flex",alignItems:"center",padding:"12px 18px",gap:8,borderBottom:"1px solid #f0e8dc",background:"#faf8f4"}}>
      <button style={{background:"none",border:"none",cursor:"pointer",padding:3,color:"#8B7355",display:"flex"}} onClick={()=>u({collapsed:!s.collapsed})}>
        {s.collapsed?"▶":"▼"}
      </button>
      {en?<input ref={r} style={{flex:1,padding:"4px 8px",border:"1px solid #8B7355",borderRadius:6,fontSize:16,fontFamily:"'Cormorant Garamond',serif",outline:"none",background:"#fff"}} value={s.name} onChange={e=>u({name:e.target.value})} onBlur={()=>setEn(false)} onKeyDown={e=>e.key==="Enter"&&setEn(false)}/>
      :<h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:16,margin:0,flex:1,display:"flex",alignItems:"center",color:"#3a3028",cursor:"pointer"}} onDoubleClick={()=>setEn(true)}>
        <span style={{color:"#8B7355",marginRight:6}}>{i+1}.</span>{s.name}
        <button style={{...B.ib,marginLeft:6}} onClick={()=>setEn(true)}>✏️</button>
      </h3>}
      <span style={{fontSize:15,fontWeight:700,color:"#5a4a3a",fontFamily:"'Cormorant Garamond',serif"}}>{fmt(t)}</span>
      <button style={{...B.ib,color:"#c0392b"}} onClick={rm}>🗑</button>
    </div>
    {!s.collapsed&&<div style={{padding:"0 0 8px"}}>
      <div style={{padding:"6px 18px"}}><textarea style={{width:"100%",padding:"6px 10px",border:"1px solid #e8e0d4",borderRadius:6,fontSize:12,fontFamily:"'DM Sans',sans-serif",background:"#faf8f4",color:"#8B7355",outline:"none",resize:"vertical",boxSizing:"border-box"}} rows={1} placeholder="Σημειώσεις ενότητας..." value={s.note||""} onChange={e=>u({note:e.target.value})}/></div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr>
          {["#","Περιγραφή","Ποσ.","Μον.","Τιμή Μον.","Σύνολο","Σημ.",""].map((h,i)=>
            <th key={i} style={{textAlign:"left",padding:"8px 6px",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,color:"#8B7355",borderBottom:"2px solid #f0e8dc"}}>{h}</th>
          )}
        </tr></thead>
        <tbody>
          {s.items.map((it,ii)=><tr key={it.id} style={{borderBottom:"1px solid #f8f4ee"}}>
            <td style={B.td}><span style={{display:"inline-flex",width:20,height:20,alignItems:"center",justifyContent:"center",borderRadius:5,background:"#f5f0e8",fontSize:10,fontWeight:700,color:"#8B7355"}}>{ii+1}</span></td>
            <td style={B.td}><input style={B.ci} value={it.description} onChange={e=>uI(it.id,{description:e.target.value})} placeholder="Περιγραφή..."/></td>
            <td style={B.td}><input style={{...B.ci,textAlign:"right"}} type="number" min={0} step="any" value={it.quantity||""} onChange={e=>uI(it.id,{quantity:parseFloat(e.target.value)||0})}/></td>
            <td style={B.td}><select style={B.cs} value={it.unit} onChange={e=>uI(it.id,{unit:e.target.value})}>{UNITS.map(u=><option key={u}>{u}</option>)}</select></td>
            <td style={B.td}><input style={{...B.ci,textAlign:"right"}} type="number" min={0} step="any" value={it.unitPrice||""} onChange={e=>uI(it.id,{unitPrice:parseFloat(e.target.value)||0})}/></td>
            <td style={{...B.td,fontWeight:700,textAlign:"right",color:"#5a4a3a",fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{fN((it.quantity||0)*(it.unitPrice||0))}</td>
            <td style={B.td}><input style={B.ci} value={it.notes} onChange={e=>uI(it.id,{notes:e.target.value})} placeholder="..."/></td>
            <td style={B.td}><button style={{...B.ib,color:"#c0392b"}} onClick={()=>dI(it.id)}>×</button></td>
          </tr>)}
          {s.items.length===0&&<tr><td colSpan={8} style={{textAlign:"center",padding:20,color:"#bbb",fontStyle:"italic"}}>Κανένα αντικείμενο</td></tr>}
        </tbody>
        <tfoot><tr>
          <td colSpan={5} style={{textAlign:"right",padding:"10px 6px",fontWeight:700,fontSize:11,textTransform:"uppercase",color:"#8B7355"}}>Σύνολο</td>
          <td style={{textAlign:"right",padding:"10px 6px",fontWeight:700,fontSize:15,color:"#3a3028",fontFamily:"'Cormorant Garamond',serif"}}>{fN(t)}</td>
          <td colSpan={2}></td>
        </tr></tfoot>
      </table>
      <button style={{display:"inline-flex",alignItems:"center",gap:5,background:"none",border:"1px dashed #ccc3b4",color:"#8B7355",padding:"6px 14px",margin:"6px 18px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600}} onClick={aI}>+ Εγγραφή</button>
    </div>}
  </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PREVIEW — PURE HABITAT STYLE
   ═══════════════════════════════════════════════════════════ */
function PrevV({offer,oT,sT,onBack}){
  const bg="#ede8df";
  const dark="#5a4a3a";
  const accent="#8B7355";
  const cName=offer.companyName||"";
  const cAddr=offer.companyAddr||"";
  const cWeb=offer.companyWeb||"";
  const logo=offer.logo||"";

  const LogoImg = ({h=40, style:sx={}}) => logo ? (
    <img src={logo} alt="" style={{height:h,maxWidth:h*3,objectFit:"contain",...sx}} />
  ) : null;

  const PageFooter = () => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginTop:24,borderTop:`1px solid ${accent}33`,paddingTop:12}}>
      <div>
        <div style={{width:30,height:2,background:dark,marginBottom:6}}/>
        <p style={{fontSize:11,color:accent,margin:0}}>{cAddr}</p>
        <p style={{fontSize:11,color:accent,margin:0}}>{cWeb}</p>
      </div>
      <LogoImg h={30} />
    </div>
  );

  return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:0}}>
    <div style={{width:"100%",marginBottom:16,display:"flex",gap:8}}>
      <button style={B.sec2} onClick={onBack}>← Πίσω στον Editor</button>
      <button style={B.prim} onClick={()=>window.print()}>🖨️ Εκτύπωση / PDF</button>
    </div>

    {/* ──── COVER PAGE ──── */}
    <div style={{background:bg,width:"100%",maxWidth:760,borderRadius:4,padding:"60px 50px",marginBottom:2,position:"relative",overflow:"hidden",minHeight:500,display:"flex",flexDirection:"column",justifyContent:"center"}}>
      {/* Decorative vertical line + dot */}
      <div style={{position:"absolute",left:50,top:80,bottom:80,width:3,background:accent,opacity:.3}}/>
      <div style={{position:"absolute",left:44,top:"50%",transform:"translateY(-50%)",width:14,height:14,borderRadius:"50%",background:accent,opacity:.5}}/>

      <div style={{marginLeft:30}}>
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:42,fontWeight:600,color:dark,margin:0,lineHeight:1.15,letterSpacing:-1}}>
          SERVICE<br/>OFFER FOR<br/>{offer.project||"CONSTRUCTION"}
        </h1>
        <div style={{position:"absolute",bottom:60,right:50}}>
          <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:48,color:accent,fontWeight:300}}>{new Date(offer.date).getFullYear()}</span>
        </div>
      </div>
      {/* Footer */}
      <div style={{position:"absolute",bottom:24,left:50}}>
        <div style={{width:30,height:2,background:dark,marginBottom:8}}/>
        <p style={{fontSize:11,color:accent,margin:0}}>{cAddr}</p>
        <p style={{fontSize:11,color:accent,margin:0}}>{cWeb}</p>
      </div>
      {(cName||logo)&&<div style={{position:"absolute",top:30,right:40,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
        <LogoImg h={48} />
        {cName&&<p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,fontWeight:600,color:accent,margin:0,letterSpacing:2,textTransform:"uppercase"}}>{cName}</p>}
      </div>}
    </div>

    {/* ──── INTRO PAGE ──── */}
    <div style={{background:bg,width:"100%",maxWidth:760,borderRadius:4,padding:"50px 50px",marginBottom:2}}>
      <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:30,color:dark,margin:"0 0 20px",fontWeight:600}}>
        Introduction to the Financial Proposal
      </h2>
      <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,color:"#6a5a4a",lineHeight:1.7}}>
        <strong>Project:</strong> {offer.project||"—"}<br/>
        <strong>Client:</strong> {offer.client||"—"}<br/>
        <strong>Date:</strong> {offer.date}
      </p>
      <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,color:"#6a5a4a",lineHeight:1.7,marginTop:16}}>
        Based on the architectural plans provided, we hereby submit our financial and technical proposal. 
        The proposal outlines the main construction phases, the specified materials, and the services required for the full completion of the project.
      </p>
      <PageFooter />
    </div>

    {/* ──── SECTIONS ──── */}
    {offer.sections.map((sec,si)=>(
      <div key={sec.id} style={{background:bg,width:"100%",maxWidth:760,borderRadius:4,padding:"40px 50px",marginBottom:2}}>
        <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,color:dark,margin:"0 0 16px",fontWeight:600}}>
          {sec.name}
        </h2>
        {sec.note&&<p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:"#8a7a6a",marginBottom:12,fontStyle:"italic"}}>{sec.note}</p>}

        {/* Items as bullet list (Pure Habitat style) */}
        <div style={{marginBottom:20}}>
          {sec.items.map((it,ii)=>(
            <div key={it.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"6px 0",borderBottom:"1px solid rgba(139,115,85,0.1)"}}>
              <span style={{color:accent,fontWeight:700,fontSize:18,lineHeight:1,marginTop:2}}>•</span>
              <div style={{flex:1}}>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,color:dark}}>{it.description||"—"}</span>
                {it.notes&&<span style={{fontSize:12,color:"#8B7355",marginLeft:6}}>({it.notes})</span>}
              </div>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:"#6a5a4a",whiteSpace:"nowrap"}}>{fN(it.quantity)} {it.unit}</span>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:"#6a5a4a",whiteSpace:"nowrap"}}>× {fN(it.unitPrice)}</span>
            </div>
          ))}
        </div>

        {/* Section Cost */}
        <div style={{textAlign:"center",marginTop:8}}>
          <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:700,color:dark,margin:0}}>
            Cost: {fmt(sT(sec))}
          </p>
        </div>

        <PageFooter />
      </div>
    ))}

    {/* ──── SUMMARY TABLE ──── */}
    <div style={{background:bg,width:"100%",maxWidth:760,borderRadius:4,padding:"40px 50px",marginBottom:2}}>
      <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,color:dark,margin:"0 0 20px"}}>Total Costs</h2>
      <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"'DM Sans',sans-serif",fontSize:14}}>
        <thead>
          <tr style={{borderBottom:`2px solid ${accent}`}}>
            <th style={{textAlign:"left",padding:"10px 12px",color:accent,fontWeight:700}}>Section</th>
            <th style={{textAlign:"right",padding:"10px 12px",color:accent,fontWeight:700}}>Cost (€)</th>
          </tr>
        </thead>
        <tbody>
          {offer.sections.map((s,i)=>(
            <tr key={s.id} style={{borderBottom:`1px solid ${accent}22`}}>
              <td style={{padding:"10px 12px",color:dark}}>{s.name}</td>
              <td style={{padding:"10px 12px",textAlign:"right",fontFamily:"'JetBrains Mono',monospace",color:dark}}>{sT(s)>0?fN(sT(s)):""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{borderTop:`2px solid ${accent}`}}>
            <td style={{padding:"12px 12px",fontWeight:700,color:accent,fontSize:16}}>Total Bid Cost</td>
            <td style={{padding:"12px 12px",textAlign:"right",fontWeight:700,color:accent,fontSize:18,fontFamily:"'JetBrains Mono',monospace"}}>{fN(oT(offer))}</td>
          </tr>
          {offer.islandSurcharge&&<tr>
            <td style={{padding:"8px 12px",color:dark,fontSize:13}}>Νησιωτική προσαύξηση (+15%)</td>
            <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"'JetBrains Mono',monospace",color:accent,fontSize:14}}>{fN(oT(offer)*0.15)}</td>
          </tr>}
          {offer.islandSurcharge&&<tr style={{borderTop:`1px solid ${accent}`}}>
            <td style={{padding:"10px 12px",fontWeight:700,color:dark,fontSize:15}}>Σύνολο με προσαύξηση</td>
            <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:dark,fontSize:18,fontFamily:"'JetBrains Mono',monospace"}}>{fN(oT(offer)*1.15)}</td>
          </tr>}
          {(()=>{const net=oT(offer)*(offer.islandSurcharge?1.15:1);const vr=offer.vatRate??24;const vat=net*vr/100;return(<>
            <tr style={{borderTop:`1px solid ${accent}44`}}>
              <td style={{padding:"8px 12px",color:dark,fontSize:13}}>Καθαρή αξία</td>
              <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"'JetBrains Mono',monospace",color:dark,fontSize:14}}>{fN(net)}</td>
            </tr>
            <tr>
              <td style={{padding:"8px 12px",color:dark,fontSize:13}}>ΦΠΑ {vr}%</td>
              <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"'JetBrains Mono',monospace",color:dark,fontSize:14}}>{fN(vat)}</td>
            </tr>
            <tr style={{borderTop:`2px solid ${accent}`}}>
              <td style={{padding:"12px 12px",fontWeight:700,color:accent,fontSize:16}}>Τελικό Σύνολο (με ΦΠΑ)</td>
              <td style={{padding:"12px 12px",textAlign:"right",fontWeight:700,color:accent,fontSize:20,fontFamily:"'JetBrains Mono',monospace"}}>{fN(net+vat)}</td>
            </tr>
          </>);})()}
          {(offer.numUnits||1)>1&&<tr style={{borderTop:`1px solid ${accent}44`}}>
            <td style={{padding:"8px 12px",fontSize:13,color:"#8a7a6a"}}>Κόστος ανά μονάδα ({offer.numUnits} μον.)</td>
            <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"'JetBrains Mono',monospace",fontSize:14,color:"#8a7a6a"}}>{fN((oT(offer)*(offer.islandSurcharge?1.15:1))/offer.numUnits)}</td>
          </tr>}
        </tfoot>
      </table>
      <PageFooter />
    </div>

    {/* ──── THANK YOU PAGE ──── */}
    <div style={{background:bg,width:"100%",maxWidth:760,borderRadius:4,padding:"80px 50px",marginBottom:20,textAlign:"center",minHeight:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:42,color:dark,fontWeight:400,margin:0}}>Thank You</h2>
      <LogoImg h={56} style={{marginTop:24}} />
      {cName&&<p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:16,color:accent,marginTop:12,letterSpacing:2,textTransform:"uppercase"}}>{cName}</p>}
    </div>
  </div>);
}

/* ═══════════════════════════════════════════════════════════
   COMPARE VIEW
   ═══════════════════════════════════════════════════════════ */
function CompareV({offers,sT,oT,onBack}){
  if(offers.length<2) return (<div><button style={B.sec2} onClick={onBack}>← Πίσω</button><p style={{color:"#8B7355",marginTop:20}}>Επίλεξε τουλάχιστον 2 προσφορές για σύγκριση.</p></div>);

  const allSecNames = [...new Set(offers.flatMap(o=>o.sections.map(s=>s.name)))];

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <button style={B.sec2} onClick={onBack}>← Πίσω</button>
        <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24,margin:0,color:"#3a3028"}}>⚖️ Σύγκριση Προσφορών</h2>
      </div>

      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",background:"#fff",borderRadius:12,overflow:"hidden",border:"1px solid #e8e0d4"}}>
          <thead>
            <tr style={{background:"#faf8f4"}}>
              <th style={{padding:"12px 16px",textAlign:"left",fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:"#8B7355",borderBottom:"2px solid #e8e0d4"}}>Ενότητα</th>
              {offers.map(o=>(
                <th key={o.id} style={{padding:"12px 16px",textAlign:"right",fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:"#3a3028",borderBottom:"2px solid #e8e0d4",minWidth:140}}>
                  {o.name}<br/><span style={{fontSize:11,color:"#8B7355",fontWeight:400}}>{o.client||"—"}</span>
                </th>
              ))}
              {offers.length===2&&<th style={{padding:"12px 16px",textAlign:"right",fontSize:12,color:"#8B7355",borderBottom:"2px solid #e8e0d4"}}>Διαφορά</th>}
            </tr>
          </thead>
          <tbody>
            {allSecNames.map((sn,i)=>(
              <tr key={i} style={{borderBottom:"1px solid #f0e8dc"}}>
                <td style={{padding:"10px 16px",fontSize:13,color:"#3a3028"}}>{sn}</td>
                {offers.map(o=>{
                  const sec=o.sections.find(s=>s.name===sn);
                  const v=sec?sT(sec):0;
                  return <td key={o.id} style={{padding:"10px 16px",textAlign:"right",fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:v>0?"#3a3028":"#ccc"}}>{v>0?fN(v):"—"}</td>;
                })}
                {offers.length===2&&(()=>{
                  const s0=offers[0].sections.find(s=>s.name===sn);
                  const s1=offers[1].sections.find(s=>s.name===sn);
                  const v0=s0?sT(s0):0; const v1=s1?sT(s1):0;
                  const diff=v1-v0; const pct=v0>0?((diff/v0)*100).toFixed(1):0;
                  return <td style={{padding:"10px 16px",textAlign:"right",fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:diff>0?"#c0392b":diff<0?"#27ae60":"#999"}}>{diff!==0?(diff>0?"+":"")+fN(diff)+" ("+pct+"%)":"—"}</td>;
                })()}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{background:"#3a3028"}}>
              <td style={{padding:"14px 16px",fontWeight:700,color:"#f5f0e8",fontSize:14}}>ΣΥΝΟΛΟ</td>
              {offers.map(o=>(
                <td key={o.id} style={{padding:"14px 16px",textAlign:"right",fontFamily:"'JetBrains Mono',monospace",fontSize:16,fontWeight:700,color:"#f5f0e8"}}>{fN(oT(o))}</td>
              ))}
              {offers.length===2&&(()=>{
                const d=oT(offers[1])-oT(offers[0]);const p=oT(offers[0])>0?((d/oT(offers[0]))*100).toFixed(1):0;
                return <td style={{padding:"14px 16px",textAlign:"right",fontSize:13,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:d>0?"#ff6b6b":d<0?"#51cf66":"#aaa"}}>{d!==0?(d>0?"+":"")+fN(d)+" ("+p+"%)":"="}</td>;
              })()}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Per unit comparison */}
      {offers.some(o=>o.numUnits>1)&&(
        <div style={{marginTop:16,background:"#fff",borderRadius:12,padding:20,border:"1px solid #e8e0d4"}}>
          <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:16,color:"#3a3028",margin:"0 0 12px"}}>Κόστος ανά μονάδα</h3>
          <div style={{display:"flex",gap:20}}>
            {offers.map(o=>(
              <div key={o.id} style={{flex:1,background:"#faf8f4",borderRadius:8,padding:16,textAlign:"center"}}>
                <p style={{fontSize:12,color:"#8B7355",margin:"0 0 4px"}}>{o.name}</p>
                <p style={{fontSize:11,color:"#aaa",margin:"0 0 8px"}}>{o.numUnits||1} μονάδ{(o.numUnits||1)===1?"α":"ες"}</p>
                <p style={{fontSize:22,fontFamily:"'Cormorant Garamond',serif",fontWeight:700,color:"#3a3028",margin:0}}>{fmt(oT(o)/(o.numUnits||1))}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SHARED STYLES
   ═══════════════════════════════════════════════════════════ */
const B={
  back:{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"#f5f0e8",padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:500,fontFamily:"'DM Sans',sans-serif"},
  prim:{display:"inline-flex",alignItems:"center",gap:7,background:"#8B7355",color:"#fff",border:"none",padding:"10px 20px",borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:"'DM Sans',sans-serif"},
  sec2:{display:"inline-flex",alignItems:"center",gap:6,background:"#fff",border:"1px solid #ddd3c4",color:"#5a4a3a",padding:"8px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontFamily:"'DM Sans',sans-serif"},
  card:{background:"#fff",borderRadius:12,padding:18,cursor:"pointer",border:"1px solid #e8e0d4",transition:"all .2s"},
  ib:{background:"none",border:"none",cursor:"pointer",padding:3,color:"#8B7355",display:"inline-flex",alignItems:"center",fontSize:14},
  modal:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20},
  mc:{background:"#fff",borderRadius:16,padding:28,maxWidth:700,width:"100%",maxHeight:"85vh",overflow:"auto",border:"1px solid #e8e0d4"},
  mi:{width:"100%",padding:"10px 14px",border:"1px solid #ddd3c4",borderRadius:8,fontSize:14,fontFamily:"'DM Sans',sans-serif",background:"#faf8f4",outline:"none",marginBottom:20,boxSizing:"border-box"},
  tc:{background:"#faf8f4",border:"1px solid #e8e0d4",borderRadius:10,padding:16,cursor:"pointer",textAlign:"left",transition:"all .2s",fontFamily:"'DM Sans',sans-serif"},
  meta:{background:"#fff",borderRadius:12,padding:22,marginBottom:14,border:"1px solid #e8e0d4"},
  inp:{padding:"8px 12px",border:"1px solid #ddd3c4",borderRadius:6,fontSize:13,fontFamily:"'DM Sans',sans-serif",background:"#faf8f4",outline:"none",boxSizing:"border-box"},
  td:{padding:"5px 6px",verticalAlign:"middle"},
  ci:{width:"100%",padding:"5px 7px",border:"1px solid transparent",borderRadius:4,fontSize:12,fontFamily:"'DM Sans',sans-serif",background:"transparent",color:"#3a3028",outline:"none",boxSizing:"border-box"},
  cs:{width:"100%",padding:"5px 4px",border:"1px solid transparent",borderRadius:4,fontSize:12,fontFamily:"'DM Sans',sans-serif",background:"transparent",color:"#3a3028",outline:"none",cursor:"pointer"},
};
