import { NextResponse } from "next/server";

import { isServerDemoMode } from "@/lib/demo-mode";

export function POST() {
  if (!isServerDemoMode()) {
    return NextResponse.json({ error: "Mode démonstration désactivé." }, { status: 404 });
  }
  return NextResponse.json({
    pagesScanned: 8,
    establishmentsDetected: 2,
    productsDetected: 3,
    categoriesDetected: 3,
    imagesDetected: 5,
    imagesRetained: 4,
    duplicatesDetected: 1,
    smallImages: 1,
    errorsCount: 0,
    validationRequired: 8,
    demo: true
  });
}
