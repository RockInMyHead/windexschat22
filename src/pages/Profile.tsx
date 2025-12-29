import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, User, Mail, Key, Crown, CreditCard, Calendar, Check, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { WalletDashboard } from "@/components/WalletDashboard";

const Profile = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Состояние для модальных окон (оставлено для совместимости)
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPaymentsHistoryModal, setShowPaymentsHistoryModal] = useState(false);
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState<string | null>(null);

  // Состояние профиля пользователя
  const [userProfile, setUserProfile] = useState({
    name: "",
    email: ""
  });

  // Состояние для данных пользователя из UserService
  const [userData, setUserData] = useState<any>(null);

  // Загружаем данные пользователя при монтировании компонента
  useEffect(() => {
    const loadUserData = async () => {
      if (user) {
        setUserProfile({
          name: user.name,
          email: user.email
        });

        try {
          // Загружаем данные пользователя через API
          const response = await fetch('/api/users/current', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: user.id,
              name: user.name,
              email: user.email
            })
          });

          if (response.ok) {
            const userInfo = await response.json();
            setUserData(userInfo);
            console.log('✅ Profile.tsx: User data loaded:', userInfo.id, userInfo.email, 'balance:', userInfo.balance);
          } else {
            console.error('Failed to load user data via API');
          }
        } catch (error) {
          console.error('Failed to load user data:', error);
        }
      }
    };

    loadUserData();
  }, [user]);

  // Данные подписки
  const currentPlan = {
    name: "WindexsAI Lite",
    status: "Активна",
    description: "Базовые функции и модель DeepSeek Chat",
    price: "Бесплатно",
    nextBilling: null
  };

  // История платежей (демо данные)
  const paymentHistory = [
    {
      id: 1,
      date: "15 ноября 2025",
      amount: "₽399",
      status: "Оплачено",
      method: "Карта **** 4242"
    },
    {
      id: 2,
      date: "15 октября 2025",
      amount: "₽399",
      status: "Оплачено",
      method: "Карта **** 4242"
    },
    {
      id: 3,
      date: "15 сентября 2025",
      amount: "₽399",
      status: "Оплачено",
      method: "Карта **** 4242"
    }
  ];

  // Обработчики кнопок
  const handleSaveProfile = () => {
    alert("Профиль сохранен успешно!");
    // Здесь можно добавить логику сохранения в базу данных или API
  };

  const handleChangePlan = () => {
    setShowPlanModal(true);
  };

  const handleViewPayments = () => {
    setShowPaymentsHistoryModal(true);
  };

  const handleChangePassword = () => {
    alert("Функция изменения пароля будет доступна в ближайшее время");
  };

  const handleLogout = () => {
    if (confirm("Вы уверены, что хотите выйти из аккаунта?")) {
      logout();
      navigate("/");
    }
  };

  const handleDeleteAccount = () => {
    if (confirm("Вы уверены, что хотите удалить аккаунт? Это действие нельзя отменить.")) {
      alert("Аккаунт будет удален. Функция будет реализована в ближайшее время.");
    }
  };

  const handlePlanChange = (newPlan: string) => {
    if (newPlan === "WindexsAI Lite") {
      // Бесплатный план - просто подтверждаем
      alert(`План успешно изменен на: ${newPlan}`);
      setShowPlanModal(false);
      // Здесь можно добавить логику обновления плана в базе данных
    } else if (newPlan === "WindexsAI Pro") {
      // Платный план - открываем платежное окно
      setSelectedPlanForPayment(newPlan);
      setShowPlanModal(false);
      setShowPaymentModal(true);
    }
  };

  const handlePayment = () => {
    // Имитация платежа через ЮKassa (тестовые данные)
    alert(`Платеж за план "${selectedPlanForPayment}" успешно обработан через ЮKassa!\n\nТестовые данные:\n- Сумма: ₽399\n- Метод: Тестовая карта\n- Статус: Оплачено\n\nПлан активирован!`);
    setShowPaymentModal(false);
    setSelectedPlanForPayment(null);
    // Здесь можно добавить логику обновления плана в базе данных
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/chat")}
            className="h-9 w-9 sm:h-10 sm:w-10"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <h1 className="text-lg sm:text-xl font-semibold text-foreground">Профиль и кошелек</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-4 sm:space-y-6">
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
                <User className="h-8 w-8 text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="text-foreground">Профиль пользователя</CardTitle>
                <CardDescription>Управление вашим аккаунтом</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Имя</Label>
              <Input
                id="name"
                placeholder="Ваше имя"
                value={userProfile.name}
                onChange={(e) => setUserProfile(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="flex gap-2">
                <Mail className="h-4 w-4 mt-3 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  value={userProfile.email}
                  onChange={(e) => setUserProfile(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>
            <Button
              className="bg-primary hover:bg-primary/90"
              onClick={handleSaveProfile}
            >
              Сохранить изменения
            </Button>
          </CardContent>
        </Card>

        {/* Кошелек вместо подписки */}
        <Card className="border-border">
          <WalletDashboard
            embedded={true}
            userId={userData?.id}
          />
        </Card>
        {userData && console.log('💰 Profile.tsx: Passing userId to WalletDashboard:', userData.id, 'email:', userData.email, 'balance:', userData.balance)}

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Key className="h-5 w-5" />
              Безопасность
            </CardTitle>
            <CardDescription>Настройки безопасности аккаунта</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              onClick={handleChangePassword}
            >
              Изменить пароль
            </Button>
            <Button
              variant="outline"
              onClick={handleLogout}
              className="w-full"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Выйти из аккаунта
            </Button>
            <div className="pt-4 border-t border-border">
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
              >
                Удалить аккаунт
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Модальное окно изменения плана */}
        <Dialog open={showPlanModal} onOpenChange={setShowPlanModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" />
                Изменить план подписки
              </DialogTitle>
              <DialogDescription>
                Выберите подходящий тарифный план для ваших нужд
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Текущий план */}
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-foreground">{currentPlan.name}</h4>
                  <span className="text-sm bg-green-600 text-white px-2 py-1 rounded-full">
                    Текущий план
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {currentPlan.description}
                </p>
                <p className="text-sm font-medium text-green-600 dark:text-green-400 mt-1">
                  {currentPlan.price}
                </p>
              </div>

              {/* Доступные планы */}
              <div className="space-y-3">
                <h4 className="font-medium text-foreground">Доступные планы:</h4>

                <div className="p-4 border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-semibold">WindexsAI Lite</h5>
                    <span className="text-sm text-green-600 dark:text-green-400 font-medium">Бесплатно</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Базовые функции и модель DeepSeek Chat
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => handlePlanChange("WindexsAI Lite")}
                    disabled={true}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Текущий план
                  </Button>
                </div>

                <div className="p-4 border border-border rounded-lg hover:border-primary/50 cursor-pointer transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-semibold">WindexsAI Pro</h5>
                    <span className="text-sm text-muted-foreground">₽399/месяц</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Полный доступ ко всем функциям и моделям DeepSeek Reasoner
                  </p>
                  <Button
                    size="sm"
                    variant="default"
                    className="w-full bg-primary hover:bg-primary/90"
                    onClick={() => handlePlanChange("WindexsAI Pro")}
                  >
                    <Crown className="h-4 w-4 mr-2" />
                    Выбрать Pro
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Модальное окно оплаты через ЮKassa */}
        <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Оплата подписки
              </DialogTitle>
              <DialogDescription>
                Оплата через ЮKassa (тестовый режим)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">План:</span>
                  <span>{selectedPlanForPayment}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Период:</span>
                  <span>1 месяц</span>
                </div>
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span>Итого:</span>
                  <span className="text-primary">₽399</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="card-number">Номер карты</Label>
                  <Input
                    id="card-number"
                    placeholder="4242 4242 4242 4242"
                    defaultValue="4242 4242 4242 4242"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Тестовая карта ЮKassa
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="expiry">Срок действия</Label>
                    <Input
                      id="expiry"
                      placeholder="12/25"
                      defaultValue="12/25"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cvv">CVV</Label>
                    <Input
                      id="cvv"
                      placeholder="123"
                      defaultValue="123"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email">Email для чека</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@example.com"
                    value={userProfile.email}
                    onChange={(e) => setUserProfile(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPaymentModal(false);
                    setSelectedPlanForPayment(null);
                  }}
                  className="flex-1"
                >
                  Отмена
                </Button>
                <Button
                  onClick={handlePayment}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Оплатить ₽399
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                🔒 Безопасная оплата через ЮKassa. Тестовый режим.
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* Модальное окно истории платежей */}
        <Dialog open={showPaymentsHistoryModal} onOpenChange={setShowPaymentsHistoryModal}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                История платежей
              </DialogTitle>
              <DialogDescription>
                Список всех ваших платежей и транзакций
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {paymentHistory.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <CreditCard className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{payment.amount}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {payment.date}
                      </p>
                      <p className="text-xs text-muted-foreground">{payment.method}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-green-600">
                      {payment.status}
                    </span>
                  </div>
                </div>
              ))}

              {paymentHistory.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>История платежей пуста</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Profile;
