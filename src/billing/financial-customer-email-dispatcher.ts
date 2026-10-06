import type { AnnualLicense } from "./annual-license.js";
import { failedPaymentNotice, successfulPurchaseNotice } from "./payment-customer-notices.js";
import type { RecoveryEmailPort } from "../email/recovery-email-port.js";
export class FinancialCustomerEmailDispatcher {
  constructor(private readonly email:RecoveryEmailPort){}
  async sendPurchaseConfirmation(purchaserEmail:string,license:AnnualLicense){
    const notice=successfulPurchaseNotice(license);
    await this.email.send({recipient:purchaserEmail,...notice});
  }
  async sendPaymentFailure(purchaserEmail:string){
    const notice=failedPaymentNotice();
    await this.email.send({recipient:purchaserEmail,...notice});
  }
}
