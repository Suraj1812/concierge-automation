import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { env } from "../../config/env";

export class PdfService {
  constructor() {
    const targetDirectory = path.resolve(process.cwd(), env.PDF_STORAGE_PATH);
    if (!fs.existsSync(targetDirectory)) {
      fs.mkdirSync(targetDirectory, { recursive: true });
    }
  }

  async generateProposalPdf(payload: {
    proposalId: string;
    customerName?: string;
    enquiryTitle: string;
    summary: string;
    recommendation: {
      title: string;
      totalAmount: number;
      currency: string;
      highlights: string[];
    };
    alternatives: Array<{
      title: string;
      totalAmount: number;
      currency: string;
      highlights: string[];
    }>;
  }): Promise<string> {
    const fileName = `proposal-${payload.proposalId}.pdf`;
    const filePath = path.resolve(process.cwd(), env.PDF_STORAGE_PATH, fileName);

    await new Promise<void>((resolve, reject) => {
      const document = new PDFDocument({
        size: "A4",
        margin: 50
      });
      const stream = fs.createWriteStream(filePath);

      document.pipe(stream);
      document.fontSize(24).text("Luxury Concierge Proposal", { align: "center" });
      document.moveDown();
      document.fontSize(12).text(`Prepared for: ${payload.customerName || "Valued Guest"}`);
      document.text(`Proposal reference: ${payload.proposalId}`);
      document.text(`Service brief: ${payload.enquiryTitle}`);
      document.moveDown();
      document.fontSize(16).text("Executive Summary");
      document.fontSize(12).text(payload.summary);
      document.moveDown();
      document.fontSize(16).text("Recommended Option");
      document.fontSize(12).text(`${payload.recommendation.title} - ${payload.recommendation.currency} ${payload.recommendation.totalAmount.toLocaleString()}`);
      payload.recommendation.highlights.forEach((highlight) => {
        document.text(`• ${highlight}`);
      });
      document.moveDown();
      document.fontSize(16).text("Alternative Options");
      payload.alternatives.forEach((option) => {
        document.fontSize(12).text(`${option.title} - ${option.currency} ${option.totalAmount.toLocaleString()}`);
        option.highlights.forEach((highlight) => {
          document.text(`• ${highlight}`);
        });
        document.moveDown(0.5);
      });
      document.end();

      stream.on("finish", () => resolve());
      stream.on("error", reject);
    });

    return filePath;
  }
}
