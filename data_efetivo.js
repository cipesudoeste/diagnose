// Efetivo inicial (semente) — pode ser editado depois direto na página
const SEED_ROSTER = [
  {
    "id": 1,
    "posto": "MAJ PM",
    "nome": "GILBERTO JOSÉ DA SILVA FILHO",
    "matricula": "30366823"
  },
  {
    "id": 2,
    "posto": "CAP PM",
    "nome": "ALBÉRICO ANDRÉ DANTAS ARRUDA",
    "matricula": "30389655"
  },
  {
    "id": 3,
    "posto": "CAP PM",
    "nome": "ARÃO DURVAL DOS SANTOS FERREIRA",
    "matricula": "30486928"
  },
  {
    "id": 4,
    "posto": "CAP PM",
    "nome": "ERNANI RÉGIS SCHETTINI",
    "matricula": "30389675"
  },
  {
    "id": 5,
    "posto": "1º TEN PM",
    "nome": "DANILO LOPES SANTOS",
    "matricula": "30640144"
  },
  {
    "id": 6,
    "posto": "1º TEN PM",
    "nome": "GUEBER PACHECO BAHIA",
    "matricula": "30270748"
  },
  {
    "id": 7,
    "posto": "1º TEN PM",
    "nome": "LUIS FILIPE SILVA BRITO",
    "matricula": "30640266"
  },
  {
    "id": 8,
    "posto": "SUBTEN PM",
    "nome": "ADÃO OLIVEIRA RIBEIRO",
    "matricula": "30295184"
  },
  {
    "id": 9,
    "posto": "SUBTEN PM",
    "nome": "ADRIANA PACHECO BOTELHO",
    "matricula": "30285954"
  },
  {
    "id": 10,
    "posto": "SUBTEN PM",
    "nome": "FRANCISNALDO SANTOS",
    "matricula": "30285570"
  },
  {
    "id": 11,
    "posto": "SUBTEN PM",
    "nome": "JORGE LUIS DE SANTANA CORREIA",
    "matricula": "30295848"
  },
  {
    "id": 12,
    "posto": "SUBTEN PM",
    "nome": "LUIS AMARAL DA SILVA",
    "matricula": "30295461"
  },
  {
    "id": 13,
    "posto": "SUBTEN PM",
    "nome": "NESTOR NOVAES DE SOUZA NETO",
    "matricula": "30285964"
  },
  {
    "id": 14,
    "posto": "SUBTEN PM",
    "nome": "WASHINGTON SILVA ANJOS",
    "matricula": "30345136"
  },
  {
    "id": 15,
    "posto": "SUBTEN PM",
    "nome": "WERNER SENA SAMPAIO",
    "matricula": "30285995"
  },
  {
    "id": 16,
    "posto": "SUBTEN PM RR/C",
    "nome": "ANGELITA BARBOSA DOS SANTOS",
    "matricula": "30292816"
  },
  {
    "id": 17,
    "posto": "1º SGT PM",
    "nome": "ALBERTO OLIVEIRA DIAS",
    "matricula": "30389740"
  },
  {
    "id": 18,
    "posto": "1º SGT PM",
    "nome": "DANIEL ANDERSON SANTANA SANTOS",
    "matricula": "30437087"
  },
  {
    "id": 19,
    "posto": "1º SGT PM",
    "nome": "EDMILSON RIBEIRO GUIMARÃES",
    "matricula": "30340056"
  },
  {
    "id": 20,
    "posto": "1º SGT PM",
    "nome": "EMERSON SEVERO DA SILVA",
    "matricula": "30289971"
  },
  {
    "id": 21,
    "posto": "1º SGT PM",
    "nome": "ERCILINO PAULO PEREIRA FILHO",
    "matricula": "30389084"
  },
  {
    "id": 22,
    "posto": "1º SGT PM",
    "nome": "EVENILDO DE SOUZA SANTOS",
    "matricula": "30308088"
  },
  {
    "id": 23,
    "posto": "1º SGT PM",
    "nome": "GENIVAL MENDES DOS SANTOS",
    "matricula": "30299807"
  },
  {
    "id": 24,
    "posto": "1º SGT PM",
    "nome": "JACKSON RODRIGUES RIBEIRO",
    "matricula": "30299804"
  },
  {
    "id": 25,
    "posto": "1º SGT PM",
    "nome": "JILMAR OLIVEIRA MOÇO",
    "matricula": "30389743"
  },
  {
    "id": 26,
    "posto": "1º SGT PM",
    "nome": "JOAB GOIABEIRA DOS SANTOS",
    "matricula": "30390179"
  },
  {
    "id": 27,
    "posto": "1º SGT PM",
    "nome": "JOÃO ALBERTO SANTOS PINHEIRO",
    "matricula": "30430441"
  },
  {
    "id": 28,
    "posto": "1º SGT PM",
    "nome": "JOÃO BATISTA LIMA DE ALMEIDA",
    "matricula": "30389620"
  },
  {
    "id": 29,
    "posto": "1º SGT PM",
    "nome": "JOÃO LUÍS LEITE TEIXEIRA",
    "matricula": "30389701"
  },
  {
    "id": 30,
    "posto": "1º SGT PM",
    "nome": "MANOEL BRITO DE FRANÇA",
    "matricula": "30391056"
  },
  {
    "id": 31,
    "posto": "1º SGT PM",
    "nome": "MANOEL PEREIRA DOS SANTOS NETO",
    "matricula": "30389514"
  },
  {
    "id": 32,
    "posto": "1º SGT PM",
    "nome": "NILSON CARLOS SANTOS NERIS",
    "matricula": "30338424"
  },
  {
    "id": 33,
    "posto": "1º SGT PM",
    "nome": "NILSON CORDEIRO CASTRO",
    "matricula": "30389697"
  },
  {
    "id": 34,
    "posto": "1º SGT PM",
    "nome": "NILTON DE ARAÚJO",
    "matricula": "30389367"
  },
  {
    "id": 35,
    "posto": "1º SGT PM",
    "nome": "RANGEL ALVES MENDES",
    "matricula": "30391362"
  },
  {
    "id": 36,
    "posto": "1º SGT PM",
    "nome": "RICARDO GULARTE TRINDADE",
    "matricula": "30390465"
  },
  {
    "id": 37,
    "posto": "1º SGT PM",
    "nome": "VALNI RODRIGUES DE QUEIROZ FILHO",
    "matricula": "30389240"
  },
  {
    "id": 38,
    "posto": "1º SGT PM",
    "nome": "VENICIUS RODRIGUES DOS SANTOS",
    "matricula": "30389732"
  },
  {
    "id": 39,
    "posto": "1º SGT PM",
    "nome": "WALTERSON SILVA SANTOS",
    "matricula": "30437183"
  },
  {
    "id": 40,
    "posto": "1º SGT PM RR/C",
    "nome": "ELIOMAR FERREIRA LEMOS",
    "matricula": "30270418"
  },
  {
    "id": 41,
    "posto": "CB PM",
    "nome": "ÁLVARO BRANDÃO DE AZEVEDO",
    "matricula": "30481253"
  },
  {
    "id": 42,
    "posto": "CB PM",
    "nome": "CLÁUDIO VIEIRA COSTA",
    "matricula": "30490003"
  },
  {
    "id": 43,
    "posto": "CB PM",
    "nome": "CLAUDIONOR DE OLIVEIRA ROCHA NETO",
    "matricula": "30481304"
  },
  {
    "id": 44,
    "posto": "CB PM",
    "nome": "DANILO RODRIGUES MENEZES",
    "matricula": "30481359"
  },
  {
    "id": 45,
    "posto": "CB PM",
    "nome": "DIEGO GUSMÃO ROCHA",
    "matricula": "30481514"
  },
  {
    "id": 46,
    "posto": "CB PM",
    "nome": "ELIZABETH CAPRINI GOMES SANTOS",
    "matricula": "30479242"
  },
  {
    "id": 47,
    "posto": "CB PM",
    "nome": "FÁBIO OLIVEIRA DO CARMO",
    "matricula": "30481531"
  },
  {
    "id": 48,
    "posto": "CB PM",
    "nome": "GILMAR SILVA BASTOS",
    "matricula": "30481146"
  },
  {
    "id": 49,
    "posto": "CB PM",
    "nome": "JACKSON DE JESUS LIMA",
    "matricula": "30481389"
  },
  {
    "id": 50,
    "posto": "CB PM",
    "nome": "JAMILLY DE JESUS XAVIER",
    "matricula": "30511640"
  },
  {
    "id": 51,
    "posto": "CB PM",
    "nome": "JOELSON SANTOS SOUZA",
    "matricula": "30505909"
  },
  {
    "id": 52,
    "posto": "CB PM",
    "nome": "KLERISTHON VINÍCIUS ROCHA LACERDA",
    "matricula": "30505913"
  },
  {
    "id": 53,
    "posto": "CB PM",
    "nome": "LEONE DE JESUS XAVIER",
    "matricula": "30505494"
  },
  {
    "id": 54,
    "posto": "CB PM",
    "nome": "LUCAS VINÍCIOS DE JESUS GONZAGA",
    "matricula": "30486032"
  },
  {
    "id": 55,
    "posto": "CB PM",
    "nome": "LUIZ EDUARDO RIBEIRO RAMOS",
    "matricula": "30479129"
  },
  {
    "id": 56,
    "posto": "CB PM",
    "nome": "MARCELO AZEVEDO NOLASCO",
    "matricula": "30481539"
  },
  {
    "id": 57,
    "posto": "CB PM",
    "nome": "MARLOS SANTOS NASCIMENTO",
    "matricula": "30480915"
  },
  {
    "id": 58,
    "posto": "CB PM",
    "nome": "MATEUS SILVA VARGES",
    "matricula": "30481357"
  },
  {
    "id": 59,
    "posto": "CB PM",
    "nome": "RAFAEL JESUS DE QUEIROZ",
    "matricula": "30506266"
  },
  {
    "id": 60,
    "posto": "CB PM",
    "nome": "RAMON SILVA SOARES",
    "matricula": "30526547"
  },
  {
    "id": 61,
    "posto": "CB PM",
    "nome": "ROGER CHRISTIAN SILVA SANTOS",
    "matricula": "30528634"
  },
  {
    "id": 62,
    "posto": "CB PM",
    "nome": "RONALDO DIAS DOS SANTOS",
    "matricula": "30481396"
  },
  {
    "id": 63,
    "posto": "CB PM",
    "nome": "WIRLON DOS SANTOS CARVALHO",
    "matricula": "30513269"
  },
  {
    "id": 64,
    "posto": "AL CB PM",
    "nome": "MATHEUS FERRAZ MACEDO",
    "matricula": "30513260"
  },
  {
    "id": 65,
    "posto": "SD 1ª Cl PM",
    "nome": "ALISSON MATOS SANTOS",
    "matricula": "92078254"
  },
  {
    "id": 66,
    "posto": "SD 1ª Cl PM",
    "nome": "ARTUR LEÃO ROCHA",
    "matricula": "30643437"
  },
  {
    "id": 67,
    "posto": "SD 1ª Cl PM",
    "nome": "CAIO EMMANUEL CARVALHO SANTOS",
    "matricula": "30643461"
  },
  {
    "id": 68,
    "posto": "SD 1ª Cl PM",
    "nome": "CAMILA ALVES OLIVEIRA",
    "matricula": "30643475"
  },
  {
    "id": 69,
    "posto": "SD 1ª Cl PM",
    "nome": "CARLOS HENRIQUE PEREIRA DO AMARAL",
    "matricula": "92069613"
  },
  {
    "id": 70,
    "posto": "SD 1ª Cl PM",
    "nome": "DIEGO AMÂNCIO BRASIL OLIVEIRA",
    "matricula": "30526091"
  },
  {
    "id": 71,
    "posto": "SD 1ª Cl PM",
    "nome": "DIEGO DIAS SANTOS",
    "matricula": "30653722"
  },
  {
    "id": 72,
    "posto": "SD 1ª Cl PM",
    "nome": "DIEGO MORAES SANTOS",
    "matricula": "30583514"
  },
  {
    "id": 73,
    "posto": "SD 1ª Cl PM",
    "nome": "DIOGO CORREIA SOUZA BRITO",
    "matricula": "30643636"
  },
  {
    "id": 74,
    "posto": "SD 1ª Cl PM",
    "nome": "DOUGLAS LIMA SILVA",
    "matricula": "30583556"
  },
  {
    "id": 75,
    "posto": "SD 1ª Cl PM",
    "nome": "ÉDER MARTINS DA SILVA",
    "matricula": "30631078"
  },
  {
    "id": 76,
    "posto": "SD 1ª Cl PM",
    "nome": "EMILLIO LIMA DOS ANJOS",
    "matricula": "92047820"
  },
  {
    "id": 77,
    "posto": "SD 1ª Cl PM",
    "nome": "ESDRAS TELES SANTOS",
    "matricula": "30564253"
  },
  {
    "id": 78,
    "posto": "SD 1ª Cl PM",
    "nome": "GEOVANA FERREIRA",
    "matricula": "30586505"
  },
  {
    "id": 79,
    "posto": "SD 1ª Cl PM",
    "nome": "GEOVANE LEITE MEIRA",
    "matricula": "30647553"
  },
  {
    "id": 80,
    "posto": "SD 1ª Cl PM",
    "nome": "GERFFTE CARNEIRO VITÓRIO",
    "matricula": "30583893"
  },
  {
    "id": 81,
    "posto": "SD 1ª Cl PM",
    "nome": "GILDES SOARES DA MATA JÚNIOR",
    "matricula": "30645977"
  },
  {
    "id": 82,
    "posto": "SD 1ª Cl PM",
    "nome": "IANDRO PEREIRA ANDRADE",
    "matricula": "92070129"
  },
  {
    "id": 83,
    "posto": "SD 1ª Cl PM",
    "nome": "ISAAC ALMEIDA GOMES",
    "matricula": "30613375"
  },
  {
    "id": 84,
    "posto": "SD 1ª Cl PM",
    "nome": "ISAAC MAGALHÃES SANTOS",
    "matricula": "30586816"
  },
  {
    "id": 85,
    "posto": "SD 1ª Cl PM",
    "nome": "ÍTALO SANTOS FERNANDES",
    "matricula": "30653300"
  },
  {
    "id": 86,
    "posto": "SD 1ª Cl PM",
    "nome": "IZAIAS CALIXTO PEREIRA JÚNIOR",
    "matricula": "30644282"
  },
  {
    "id": 87,
    "posto": "SD 1ª Cl PM",
    "nome": "JEAN DE JESUS SANTOS",
    "matricula": "92051936"
  },
  {
    "id": 88,
    "posto": "SD 1ª Cl PM",
    "nome": "JOÃO ROBERTO NOGUEIRA DA SILVA",
    "matricula": "92079121"
  },
  {
    "id": 89,
    "posto": "SD 1ª Cl PM",
    "nome": "JORGE RAYNER RAMOS SOARES",
    "matricula": "30583552"
  },
  {
    "id": 90,
    "posto": "SD 1ª Cl PM",
    "nome": "JOSEMAR SANTOS SILVA",
    "matricula": "30586851"
  },
  {
    "id": 91,
    "posto": "SD 1ª Cl PM",
    "nome": "LUANN ALMEIDA ALCÂNTARA",
    "matricula": "30604302"
  },
  {
    "id": 92,
    "posto": "SD 1ª Cl PM",
    "nome": "LUCAS VITOR CRUZ",
    "matricula": "30587197"
  },
  {
    "id": 93,
    "posto": "SD 1ª Cl PM",
    "nome": "LUCIANO BRITO BATISTA",
    "matricula": "30586187"
  },
  {
    "id": 94,
    "posto": "SD 1ª Cl PM",
    "nome": "MAGNO SOUSA SIMÕES JÚNIOR",
    "matricula": "92079124"
  },
  {
    "id": 95,
    "posto": "SD 1ª Cl PM",
    "nome": "MÁRCIO DE JESUS JARDIM",
    "matricula": "30587200"
  },
  {
    "id": 96,
    "posto": "SD 1ª Cl PM",
    "nome": "MARCOS RAMOS SANTOS",
    "matricula": "92047605"
  },
  {
    "id": 97,
    "posto": "SD 1ª Cl PM",
    "nome": "MATEUS ALVES SANTOS",
    "matricula": "30644870"
  },
  {
    "id": 98,
    "posto": "SD 1ª Cl PM",
    "nome": "MÔNICA DE JESUS FERRAZ DE SOUZA",
    "matricula": "30644891"
  },
  {
    "id": 99,
    "posto": "SD 1ª Cl PM",
    "nome": "PABLO PEREIRA DUTRA",
    "matricula": "30583927"
  },
  {
    "id": 100,
    "posto": "SD 1ª Cl PM",
    "nome": "PAULO CESAR SANTOS VILASBOAS",
    "matricula": "30528072"
  },
  {
    "id": 101,
    "posto": "SD 1ª Cl PM",
    "nome": "REGINE SOUSA SILVA",
    "matricula": "92069741"
  },
  {
    "id": 102,
    "posto": "SD 1ª Cl PM",
    "nome": "RODRIGO CEZÁRIO SILVA DE JESUS",
    "matricula": "30645008"
  },
  {
    "id": 103,
    "posto": "SD 1ª Cl PM",
    "nome": "THIAGO DUTRA CARDOSO",
    "matricula": "92078759"
  },
  {
    "id": 104,
    "posto": "SD 1ª Cl PM",
    "nome": "VENÍCIUS RIBEIRO DOS SANTOS",
    "matricula": "30644469"
  },
  {
    "id": 105,
    "posto": "SD 1ª Cl PM",
    "nome": "VICTOR FILIPE COSTA LIMA",
    "matricula": "30645440"
  },
  {
    "id": 106,
    "posto": "SD 1ª Cl PM",
    "nome": "WESLEY ALCÂNTARA SILVA",
    "matricula": "30564267"
  }
];

const DEFAULT_QDL = {
  Maj: 1, Cap: 3, Ten: 13, Subten: 8, Sgt: 26, Cb: 33, Sd: 79
};
