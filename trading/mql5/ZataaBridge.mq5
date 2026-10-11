//+------------------------------------------------------------------+
//| ZataaBridge.mq5 — jembatan MT5 ↔ tim Trading Zataa (XAUUSD)       |
//| Tiap N detik: kirim akun, harga, posisi, deal tertutup & candle   |
//| ke server (scripts/trading/run.mjs), lalu jalankan instruksi      |
//| order dari Wiratama (Execution). Pasang di chart XAUUSD.          |
//|                                                                    |
//| Wajib: Tools → Options → Expert Advisors → "Allow WebRequest"     |
//|        tambahkan alamat ServerUrl (mis. http://IP-VPS:8787)       |
//| Pengaman: akun REAL ditolak kecuali AllowLive = true; lot dibatasi |
//| MaxLot; hanya simbol & magic number milik EA ini yang disentuh.   |
//+------------------------------------------------------------------+
#property copyright "Zataa AI Office"
#property version   "1.00"
#property strict
#include <Trade/Trade.mqh>

input string ServerUrl   = "http://127.0.0.1:8787";  // alamat bridge (tanpa / di akhir)
input string Token       = "";                       // sama dengan TRD_TOKEN di .env server
input int    SyncSeconds = 5;                        // jeda kirim data
input bool   AllowLive   = false;                    // izinkan eksekusi di akun REAL
input double MaxLot      = 1.0;                      // batas lot per order
input long   Magic       = 20261012;                 // penanda order milik EA ini

CTrade   trade;
bool     g_first = true;
datetime g_dealsFrom = 0;

int OnInit()
{
   trade.SetExpertMagicNumber(Magic);
   trade.SetDeviationInPoints(50);
   trade.SetTypeFillingBySymbol(_Symbol);
   g_dealsFrom = TimeCurrent() - 86400;
   EventSetTimer(MathMax(2, SyncSeconds));
   Print("ZataaBridge siap: ", ServerUrl, " simbol ", _Symbol, " akun ", IsDemo() ? "DEMO" : "REAL");
   return(INIT_SUCCEEDED);
}
void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer() { Sync(); }

bool IsDemo() { return AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_REAL; }
string Num(double v, int d = 2) { return DoubleToString(v, d); }
string Esc(string s) { StringReplace(s, "\\", "\\\\"); StringReplace(s, "\"", "\\\""); return s; }

//--- candle → [[t,o,h,l,c,v],...]
string Bars(ENUM_TIMEFRAMES tf, int n)
{
   MqlRates r[];
   int got = CopyRates(_Symbol, tf, 0, n, r);
   string s = "[";
   for(int i = 0; i < got; i++)
   {
      if(i > 0) s += ",";
      s += "[" + IntegerToString((long)r[i].time) + "," + Num(r[i].open) + "," + Num(r[i].high) + "," + Num(r[i].low) + "," + Num(r[i].close) + "," + IntegerToString((long)r[i].tick_volume) + "]";
   }
   return s + "]";
}

string Positions()
{
   string s = "[";
   bool first = true;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0 || PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != Magic) continue;
      if(!first) s += ",";
      first = false;
      s += "{\"ticket\":" + IntegerToString((long)t) + ",\"type\":\"" + (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "buy" : "sell") + "\"" +
           ",\"volume\":" + Num(PositionGetDouble(POSITION_VOLUME)) + ",\"price_open\":" + Num(PositionGetDouble(POSITION_PRICE_OPEN)) +
           ",\"sl\":" + Num(PositionGetDouble(POSITION_SL)) + ",\"tp\":" + Num(PositionGetDouble(POSITION_TP)) + ",\"profit\":" + Num(PositionGetDouble(POSITION_PROFIT)) + "}";
   }
   return s + "]";
}

//--- deal penutupan posisi milik EA sejak sync terakhir
string Deals()
{
   string s = "[";
   bool first = true;
   datetime to = TimeCurrent() + 60;
   if(!HistorySelect(g_dealsFrom, to)) return "[]";
   for(int i = 0; i < HistoryDealsTotal(); i++)
   {
      ulong d = HistoryDealGetTicket(i);
      if(HistoryDealGetString(d, DEAL_SYMBOL) != _Symbol || HistoryDealGetInteger(d, DEAL_MAGIC) != Magic) continue;
      if(HistoryDealGetInteger(d, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      long reason = HistoryDealGetInteger(d, DEAL_REASON);
      string why = reason == DEAL_REASON_SL ? "SL" : reason == DEAL_REASON_TP ? "TP" : "EA";
      if(!first) s += ",";
      first = false;
      s += "{\"ticket\":" + IntegerToString((long)d) + ",\"position_id\":" + IntegerToString(HistoryDealGetInteger(d, DEAL_POSITION_ID)) +
           ",\"entry\":\"out\",\"price\":" + Num(HistoryDealGetDouble(d, DEAL_PRICE)) + ",\"profit\":" + Num(HistoryDealGetDouble(d, DEAL_PROFIT)) +
           ",\"commission\":" + Num(HistoryDealGetDouble(d, DEAL_COMMISSION)) + ",\"swap\":" + Num(HistoryDealGetDouble(d, DEAL_SWAP)) +
           ",\"reason\":\"" + why + "\",\"time\":" + IntegerToString((long)HistoryDealGetInteger(d, DEAL_TIME)) + "}";
   }
   g_dealsFrom = TimeCurrent() - 5;
   return s + "]";
}

//--- HTTP POST JSON → body balasan
bool Post(string path, string json, string &reply)
{
   char data[], res[];
   string hdr = "Content-Type: application/json\r\nX-Token: " + Token + "\r\n", rh;
   StringToCharArray(json, data, 0, StringLen(json), CP_UTF8);
   ResetLastError();
   int code = WebRequest("POST", ServerUrl + path, hdr, 8000, data, res, rh);
   if(code == -1) { Print("WebRequest gagal (", GetLastError(), "). Tambahkan ", ServerUrl, " di Allow WebRequest."); return false; }
   reply = CharArrayToString(res, 0, WHOLE_ARRAY, CP_UTF8);
   if(code != 200) { Print("server balas ", code, ": ", reply); return false; }
   return true;
}

void Sync()
{
   MqlTick tk;
   if(!SymbolInfoTick(_Symbol, tk)) return;
   int n = g_first ? 400 : 3;
   string json = "{\"login\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) +
      ",\"server\":\"" + Esc(AccountInfoString(ACCOUNT_SERVER)) + "\",\"demo\":" + (IsDemo() ? "true" : "false") +
      ",\"symbol\":\"" + _Symbol + "\",\"balance\":" + Num(AccountInfoDouble(ACCOUNT_BALANCE)) + ",\"equity\":" + Num(AccountInfoDouble(ACCOUNT_EQUITY)) +
      ",\"margin_free\":" + Num(AccountInfoDouble(ACCOUNT_MARGIN_FREE)) + ",\"bid\":" + Num(tk.bid) + ",\"ask\":" + Num(tk.ask) +
      ",\"time\":" + IntegerToString((long)tk.time) + ",\"positions\":" + Positions() + ",\"deals\":" + Deals() +
      ",\"bars\":{\"M15\":" + Bars(PERIOD_M15, n) + ",\"H1\":" + Bars(PERIOD_H1, n) + ",\"H4\":" + Bars(PERIOD_H4, n) + "}}";
   string reply;
   if(!Post("/ea/sync", json, reply)) return;
   g_first = false;
   RunCommands(reply);
}

//--- parser JSON mini: ambil nilai field dari satu objek datar
string JStr(string obj, string key)
{
   int p = StringFind(obj, "\"" + key + "\"");
   if(p < 0) return "";
   p = StringFind(obj, ":", p) + 1;
   while(p < StringLen(obj) && (StringGetCharacter(obj, p) == ' ')) p++;
   if(StringGetCharacter(obj, p) == '"') { int e = StringFind(obj, "\"", p + 1); return StringSubstr(obj, p + 1, e - p - 1); }
   int e = p;
   while(e < StringLen(obj)) { ushort c = StringGetCharacter(obj, e); if(c == ',' || c == '}') break; e++; }
   return StringSubstr(obj, p, e - p);
}
double JNum(string obj, string key) { return StringToDouble(JStr(obj, key)); }

void Ack(long id, bool ok, ulong ticket, double price, string err)
{
   string j = "{\"id\":" + IntegerToString(id) + ",\"ok\":" + (ok ? "true" : "false") + ",\"ticket\":" + IntegerToString((long)ticket) +
              ",\"price\":" + Num(price) + ",\"error\":\"" + Esc(err) + "\"}";
   string r;
   Post("/ea/ack", j, r);
}

void RunCommands(string reply)
{
   int a = StringFind(reply, "\"commands\"");
   if(a < 0) return;
   int p = StringFind(reply, "[", a);
   while(p >= 0)
   {
      int s = StringFind(reply, "{", p), e = StringFind(reply, "}", s);
      if(s < 0 || e < 0) break;
      int close = StringFind(reply, "]", p);
      if(close >= 0 && close < s) break;
      Execute(StringSubstr(reply, s, e - s + 1));
      p = e + 1;
   }
}

void Execute(string c)
{
   long id = (long)JNum(c, "id");
   string action = JStr(c, "action");
   if(!IsDemo() && !AllowLive) { Ack(id, false, 0, 0, "akun REAL tapi AllowLive=false"); return; }
   if(action == "open")
   {
      string side = JStr(c, "side");
      double vol = MathMin(JNum(c, "volume"), MaxLot);
      double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP), vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
      vol = MathMax(vmin, MathFloor(vol / step) * step);
      double sl = JNum(c, "sl"), tp = JNum(c, "tp");
      string cm = JStr(c, "comment");
      bool ok = side == "buy" ? trade.Buy(vol, _Symbol, 0, sl, tp, cm) : trade.Sell(vol, _Symbol, 0, sl, tp, cm);
      ulong pos = 0;
      if(ok && trade.ResultDeal() > 0 && HistoryDealSelect(trade.ResultDeal())) pos = (ulong)HistoryDealGetInteger(trade.ResultDeal(), DEAL_POSITION_ID);
      Ack(id, ok && trade.ResultRetcode() == TRADE_RETCODE_DONE, pos, trade.ResultPrice(), ok ? "" : trade.ResultRetcodeDescription());
   }
   else if(action == "close")
   {
      ulong t = (ulong)JNum(c, "ticket");
      bool ok = PositionSelectByTicket(t) && PositionGetInteger(POSITION_MAGIC) == Magic && trade.PositionClose(t);
      Ack(id, ok, t, trade.ResultPrice(), ok ? "" : "posisi tidak ada / gagal tutup");
   }
   else if(action == "modify")
   {
      ulong t = (ulong)JNum(c, "ticket");
      bool ok = PositionSelectByTicket(t) && PositionGetInteger(POSITION_MAGIC) == Magic && trade.PositionModify(t, JNum(c, "sl"), JNum(c, "tp"));
      Ack(id, ok, t, 0, ok ? "" : "gagal ubah SL/TP");
   }
   else Ack(id, false, 0, 0, "aksi tidak dikenal");
}
