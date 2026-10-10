export interface ConnectionTranslation {
  language: string;
  direction: "ltr" | "rtl";
  title: string;
  message: string;
  choose: string;
  submit: string;
  note: string;
  languageLabel: string;
  fields: Record<"country"|"network"|"provider"|"client"|"platform"|"softwareVersion",string>;
}
function pack(language:string,direction:"ltr"|"rtl",text:string[],fields:string[]):ConnectionTranslation {
  const [title,message,choose,submit,note,languageLabel]=text;
  return {language,direction,title,message,choose,submit,note,languageLabel,fields:{country:fields[0],network:fields[1],provider:fields[2],client:fields[3],platform:fields[4],softwareVersion:fields[5]}};
}
// Application-managed packs can extend this catalog with any valid language tag.
// Provider/app names are catalog labels rather than translated product names.
export const CONNECTION_TRANSLATIONS: Record<string,ConnectionTranslation> = {
 en:pack("English","ltr",["Help us check your connection","We couldn't identify some connection details automatically. Please choose the missing details below so we can check your connection.","Choose an option","Check connection","Your choices help us find a connection. We will check it before sending.","Language"],["Country","Internet provider or network","Email provider","Email app or browser","Device or operating system","Software version"]),
 nb:pack("Norsk bokmål","ltr",["Hjelp oss med å sjekke tilkoblingen din","Vi kunne ikke finne alle tilkoblingsdetaljene automatisk. Velg de manglende opplysningene nedenfor, slik at vi kan sjekke tilkoblingen din.","Velg et alternativ","Sjekk tilkoblingen","Valgene dine hjelper oss med å finne en tilkobling. Vi sjekker den før sending.","Språk"],["Land","Internettleverandør eller nettverk","E-postleverandør","E-postapp eller nettleser","Enhet eller operativsystem","Programvareversjon"]),
 sv:pack("Svenska","ltr",["Hjälp oss att kontrollera din anslutning","Vi kunde inte identifiera alla anslutningsuppgifter automatiskt. Välj de uppgifter som saknas nedan så att vi kan kontrollera din anslutning.","Välj ett alternativ","Kontrollera anslutningen","Dina val hjälper oss att hitta en anslutning. Vi kontrollerar den innan något skickas.","Språk"],["Land","Internetleverantör eller nätverk","E-postleverantör","E-postapp eller webbläsare","Enhet eller operativsystem","Programvaruversion"]),
 fa:pack("فارسی","rtl",["به ما کمک کنید اتصال شما را بررسی کنیم","نتوانستیم برخی جزئیات اتصال را به‌طور خودکار شناسایی کنیم. لطفاً اطلاعات مشخص‌نشده را از گزینه‌های زیر انتخاب کنید تا اتصال شما را بررسی کنیم.","یک گزینه انتخاب کنید","بررسی اتصال","انتخاب‌های شما به ما در یافتن اتصال کمک می‌کند. پیش از ارسال، آن را بررسی می‌کنیم.","زبان"],["کشور","ارائه‌دهنده اینترنت یا شبکه","ارائه‌دهنده ایمیل","برنامه ایمیل یا مرورگر","دستگاه یا سیستم‌عامل","نسخه نرم‌افزار"]),
 ar:pack("العربية","rtl",["ساعدنا في التحقق من اتصالك","لم نتمكن من تحديد بعض تفاصيل الاتصال تلقائيًا. يرجى اختيار التفاصيل الناقصة أدناه حتى نتمكن من التحقق من اتصالك.","اختر خيارًا","التحقق من الاتصال","تساعدنا اختياراتك في العثور على اتصال. سنتحقق منه قبل الإرسال.","اللغة"],["البلد","مزود الإنترنت أو الشبكة","مزود البريد الإلكتروني","تطبيق البريد أو المتصفح","الجهاز أو نظام التشغيل","إصدار البرنامج"]),
 es:pack("Español","ltr",["Ayúdanos a comprobar tu conexión","No pudimos identificar automáticamente algunos detalles de la conexión. Elige los datos que faltan para que podamos comprobarla.","Elige una opción","Comprobar conexión","Tus elecciones nos ayudan a encontrar una conexión. La comprobaremos antes de enviar.","Idioma"],["País","Proveedor de internet o red","Proveedor de correo","Aplicación de correo o navegador","Dispositivo o sistema operativo","Versión del software"]),
 fr:pack("Français","ltr",["Aidez-nous à vérifier votre connexion","Nous n’avons pas pu identifier automatiquement certains détails de connexion. Choisissez les informations manquantes ci-dessous pour nous permettre de vérifier votre connexion.","Choisissez une option","Vérifier la connexion","Vos choix nous aident à trouver une connexion. Nous la vérifierons avant l’envoi.","Langue"],["Pays","Fournisseur d’accès ou réseau","Fournisseur de messagerie","Application de messagerie ou navigateur","Appareil ou système d’exploitation","Version du logiciel"]),
 de:pack("Deutsch","ltr",["Helfen Sie uns, Ihre Verbindung zu prüfen","Einige Verbindungsdetails konnten nicht automatisch erkannt werden. Wählen Sie die fehlenden Angaben aus, damit wir Ihre Verbindung prüfen können.","Option auswählen","Verbindung prüfen","Ihre Auswahl hilft uns, eine Verbindung zu finden. Wir prüfen sie vor dem Senden.","Sprache"],["Land","Internetanbieter oder Netzwerk","E-Mail-Anbieter","E-Mail-App oder Browser","Gerät oder Betriebssystem","Softwareversion"]),
 zh:pack("中文","ltr",["帮助我们检查您的连接","我们无法自动识别部分连接信息。请选择下面缺少的信息，以便我们检查您的连接。","请选择","检查连接","您的选择有助于我们找到连接。发送前我们会进行检查。","语言"],["国家","互联网服务提供商或网络","电子邮件服务提供商","邮件应用或浏览器","设备或操作系统","软件版本"])
};
export function selectConnectionLanguage(requested:string,catalog:Record<string,ConnectionTranslation>=CONNECTION_TRANSLATIONS):string {
  const tags=Object.keys(catalog);
  if(!tags.length)throw new Error("EMPTY_CONNECTION_LANGUAGE_CATALOG");
  for(const [tag,translation] of Object.entries(catalog)){
    try{Intl.getCanonicalLocales(tag);}catch{throw new Error("INVALID_CONNECTION_LANGUAGE_CATALOG");}
    if(!translation||!["ltr","rtl"].includes(translation.direction)||[translation.language,translation.title,translation.message,translation.choose,translation.submit,translation.note,translation.languageLabel,...Object.values(translation.fields)].some(value=>typeof value!=="string"||!value.trim())||["country","network","provider","client","platform","softwareVersion"].some(key=>!translation.fields[key as keyof typeof translation.fields]))throw new Error("INVALID_CONNECTION_LANGUAGE_CATALOG");
  }
  const normalized=requested.toLowerCase();
  return tags.find(tag=>tag.toLowerCase()===normalized)??tags.find(tag=>tag.toLowerCase()===normalized.split("-")[0])??tags.find(tag=>tag==="en")??tags[0];
}
