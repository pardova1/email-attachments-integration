export interface RecoveryEmail {
  recipient: string;
  subject: string;
  text: string;
}
export interface RecoveryEmailPort {
  send(message: RecoveryEmail): Promise<void>;
}
