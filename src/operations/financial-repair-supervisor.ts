import { FinancialOperationsComplianceAgent, type FinancialAssessment, type FinancialCheck } from "./financial-operations-compliance-agent.js";
export interface FinancialRepairPort { repair(issue:string):Promise<boolean>; }
export interface FinancialRecheckPort { check():Promise<FinancialCheck>; }
export class FinancialRepairSupervisor {
  constructor(private readonly agent:FinancialOperationsComplianceAgent,private readonly repairer:FinancialRepairPort,private readonly rechecker:FinancialRecheckPort){}
  async analyzeRepairAndRecheck(initial:FinancialCheck):Promise<FinancialAssessment>{
    let assessment=this.agent.assess(initial);
    if(assessment.action!=="analyze-and-repair") return assessment;
    for(const issue of assessment.issues){ if(!(await this.repairer.repair(issue))) return assessment; }
    assessment=this.agent.assess(await this.rechecker.check());
    return assessment;
  }
}
