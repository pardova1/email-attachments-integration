import type { AnnualLicense } from "./annual-license.js";
import { failedPaymentNotice, successfulPurchaseNotice } from "./payment-customer-notices.js";
import type { IdempotentEmailDispatcher } from "../email/idempotent-email-dispatcher.js";
export class FinancialCustomerEmailDispatcher {
  constructor(private readonly email:IdempotentEmailDispatcher){}
  async sendPurchaseConfirmation(eventKey:string,purchaserEmail:string,license:AnnualLicense){
    const notice=successfulPurchaseNotice(license);
    return this.email.send(`financial:${eventKey}:purchase-confirmation:${purchaserEmail}`,{recipient:purchaserEmail,...notice});
  }
  async sendPaymentFailure(eventKey:string,purchaserEmail:string){
    const notice=failedPaymentNotice();
    return this.email.send(`financial:${eventKey}:payment-failure:${purchaserEmail}`,{recipient:purchaserEmail,...notice});
  }
}
