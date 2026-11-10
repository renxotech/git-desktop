#include "DesktopNotificationsManager.h"
#include "DesktopNotification.h"
#include "Utils.h"
#include "DesktopNotificationsActionCenterActivator.h"

#include <wrl\wrappers\corewrappers.h>
#include <sstream>
#include <iostream>

using namespace Microsoft::WRL;
using namespace Microsoft::WRL::Details;
using namespace ABI::Windows::UI;
using namespace ABI::Windows::UI::Notifications;
using namespace ABI::Windows::Data::Xml::Dom;
using namespace Windows::Foundation;
using namespace Wrappers;

DesktopNotificationsManager::DesktopNotificationsManager(const std::wstring &toastActivatorClsid,
                                                         Napi::Function &callback)
    : m_ref(0),
      m_toastActivatorClsid(toastActivatorClsid),
      m_callback(Napi::ThreadSafeFunction::New(callback.Env(), callback, "Notification Callback", 0, 1))
{
    {
        APTTYPE apartment;
        APTTYPEQUALIFIER qualifier;
        HRESULT apartmentResult = CoGetApartmentType(&apartment, &qualifier);
        if (FAILED(apartmentResult) && apartmentResult != CO_E_NOTINITIALIZED)
        {
            DN_LOG_ERROR(L"Failed to query COM apartment: " << apartmentResult);
            return;
        }
        const RO_INIT_TYPE initType = SUCCEEDED(apartmentResult) &&
            (apartment == APTTYPE_STA || apartment == APTTYPE_MAINSTA)
            ? RO_INIT_SINGLETHREADED : RO_INIT_MULTITHREADED;
        HRESULT hr = Windows::Foundation::Initialize(initType);
        if (!SUCCEEDED(hr))
        {
            DN_LOG_ERROR(L"Failed to initialize Windows Runtime: " << hr);
            return;
        }
        m_runtimeInitialized = true;
    }
    {
        HRESULT hr = GetActivationFactory(
            HStringReference(RuntimeClass_Windows_UI_Notifications_ToastNotificationManager)
                .Get(),
            &m_toastManager);
        if (!SUCCEEDED(hr))
        {
            DN_LOG_ERROR(L"Failed to get notification factory: " << hr);
            return;
        }
    }

    if (char *envAppID = std::getenv("DN_APP_ID"))
    {
        DN_LOG_INFO(L"Using custom App User Model ID '" << envAppID << "'");

        HRESULT hr = SetCurrentProcessExplicitAppUserModelID(Utils::utf8ToWideChar(std::string(envAppID)));
        if (!SUCCEEDED(hr))
        {
            DN_LOG_ERROR(L"DesktopNotificationsManager: Failed to set AUMID");
            return;
        }
    }

    {
        PWSTR appID = nullptr;
        HRESULT hr = GetCurrentProcessExplicitAppUserModelID(&appID);
        if (!SUCCEEDED(hr))
        {
            DN_LOG_ERROR(L"Couldn't retrieve AUMID");
            return;
        }
        else
        {
            m_appID = std::wstring(appID);
            CoTaskMemFree(appID);
        }
    }

    if (m_appID.empty())
    {
        DN_LOG_ERROR(L"Notification App User Model ID is empty");
        return;
    }
    m_initialized = SUCCEEDED(RegisterClassObjects(m_toastActivatorClsid));
}

HRESULT DesktopNotificationsManager::RegisterClassObjects(const std::wstring &toastActivatorClsid)
{
    // Create an out-of-proc COM module with caching disabled. The supplied
    // method is invoked when the last instance object of the module is released.
    // The singleton must not retain a callback to a manager that may fail to
    // initialize and be discarded. No zero-object notification is needed.
    auto &module = Module<OutOfProcDisableCaching>::Create();

    // Usually COM module classes statically define their CLSID at compile time
    // through the use of various macros, and WRL::Module internals takes care of
    // creating the class objects and registering them. However, we need to
    // register the same object with different CLSIDs depending on a runtime
    // setting, so we handle that logic here.

    ComPtr<IUnknown> factory;
    unsigned int flags = ModuleType::OutOfProcDisableCaching;

    HRESULT hr = CreateClassFactory<
        SimpleClassFactory<DesktopNotificationsActionCenterActivator>>(
        &flags, nullptr, __uuidof(IClassFactory), &factory);
    if (FAILED(hr))
    {
        DN_LOG_ERROR("Failed to create Factory for Action Center activator; hr: " << hr);
        return hr;
    }

    ComPtr<IClassFactory> class_factory;
    hr = factory.As(&class_factory);
    if (FAILED(hr))
    {
        DN_LOG_ERROR("Failed to create IClassFactory for Action Center activator; hr: " << hr);
        return hr;
    }

    CLSID activatorClsid;
    hr = CLSIDFromString(toastActivatorClsid.c_str(), &activatorClsid);
    if (FAILED(hr))
    {
        DN_LOG_ERROR("Invalid notification activator CLSID; hr: " << hr);
        return hr;
    }

    // All pointers in this array are unowned. Do not release them.
    IClassFactory *class_factories[] = {class_factory.Get()};
    IID class_ids[] = {activatorClsid};

    hr = module.RegisterCOMObject(nullptr, class_ids, class_factories, m_comCookies,
                                  std::extent<decltype(m_comCookies)>());
    if (FAILED(hr))
    {
        DN_LOG_ERROR("Failed to register Action Center activator; hr: " << hr);
    }
    else
    {
        module.IncrementObjectCount();
        m_classObjectsRegistered = true;
    }

    return hr;
}

DesktopNotificationsManager::~DesktopNotificationsManager()
{
    m_callback.Release();
    m_desktopNotifications.clear();

    if (m_classObjectsRegistered)
    {
        UnregisterClassObjects();
    }
    // Release all apartment-bound references before balancing RoInitialize.
    m_toastManager.Reset();
    if (m_runtimeInitialized)
    {
        Windows::Foundation::Uninitialize();
    }
}

HRESULT DesktopNotificationsManager::UnregisterClassObjects()
{
    auto &module = Module<OutOfProcDisableCaching>::GetModule();

    module.DecrementObjectCount();

    HRESULT hr = module.UnregisterCOMObject(nullptr, m_comCookies,
                                            std::extent<decltype(m_comCookies)>());
    if (FAILED(hr))
    {
        DN_LOG_ERROR("Failed to unregister Action Center activator; hr: " << hr);
    }

    return hr;
}

const std::string DesktopNotificationsManager::getCurrentPermission()
{
    Microsoft::WRL::ComPtr<ABI::Windows::UI::Notifications::IToastNotifier> notifier;
    if (!DN_CHECK_RESULT(m_toastManager->CreateToastNotifierWithId(
            HStringReference(m_appID.c_str()).Get(), &notifier)))
    {
        DN_LOG_ERROR("Failed to create a ToastNotifier to ensure your appId is registered");
        return "default";
    }

    NotificationSetting setting = NotificationSetting_Enabled;
    if (!DN_CHECK_RESULT(notifier->get_Setting(&setting)))
    {
        DN_LOG_ERROR("Failed to retreive NotificationSettings to ensure your appId is registered");
        return "default";
    }

    return (setting == NotificationSetting_Enabled ? "granted" : "denied");
}

ComPtr<IToastNotificationHistory> DesktopNotificationsManager::getHistory()
{
    ComPtr<IToastNotificationManagerStatics2> toastStatics2;
    if (DN_CHECK_RESULT(m_toastManager.As(&toastStatics2)))
    {
        ComPtr<IToastNotificationHistory> nativeHistory;
        DN_CHECK_RESULT(toastStatics2->get_History(&nativeHistory));
        return nativeHistory;
    }
    return {};
}

HRESULT DesktopNotificationsManager::displayToast(const std::wstring &id,
                                                  const std::wstring &title,
                                                  const std::wstring &body,
                                                  const std::wstring &userInfo)
{
    std::shared_ptr<DesktopNotification> d = std::make_shared<DesktopNotification>(id, m_appID, title, body, userInfo);
    m_desktopNotifications.push_back(d);
    return d->createToast(m_toastManager, this);
}

bool DesktopNotificationsManager::closeToast(const std::wstring &id)
{
    // Iterate through m_desktopNotifications looking for a notification with
    // the given id, close that notification and remove it from the list.
    for (auto it = m_desktopNotifications.begin(); it != m_desktopNotifications.end(); ++it)
    {
        auto notification = *it;
        if (notification->getID() == id)
        {
            m_desktopNotifications.erase(it);
            return closeNotification(notification);
        }
    }

    return false;
}

void DesktopNotificationsManager::handleActivatorEvent(const std::wstring &launchArgs)
{
    const auto notificationID = Utils::parseNotificationID(launchArgs);
    const auto userInfo = Utils::parseUserInfo(launchArgs);
    invokeJSCallback("click", notificationID, userInfo);
}

bool DesktopNotificationsManager::closeNotification(std::shared_ptr<DesktopNotification> d)
{
    if (auto history = getHistory())
    {
        if (DN_CHECK_RESULT(history->RemoveGroupedTagWithId(
                HStringReference(d->getID().c_str()).Get(), HStringReference(DN_GROUP_NAME).Get(),
                HStringReference(m_appID.c_str()).Get())))
        {
            return true;
        }
    }

    DN_LOG_ERROR("Notification " << d->getID() << " does not exist");
    return false;
}

// DesktopToastActivatedEventHandler
IFACEMETHODIMP DesktopNotificationsManager::Invoke(_In_ IToastNotification *sender,
                                                   _In_ IInspectable *args)
{
    IToastActivatedEventArgs *buttonReply = nullptr;
    args->QueryInterface(&buttonReply);
    if (buttonReply == nullptr)
    {
        DN_LOG_ERROR(L"args is not a IToastActivatedEventArgs");
        return S_OK;
    }

    const auto notificationID = DesktopNotification::getNotificationIDFromToast(sender);
    const auto userInfo = DesktopNotification::getUserInfoFromToast(sender);
    invokeJSCallback("click", notificationID, userInfo);

    return S_OK;
}

// DesktopToastDismissedEventHandler
IFACEMETHODIMP DesktopNotificationsManager::Invoke(_In_ IToastNotification *sender,
                                                   _In_ IToastDismissedEventArgs *e)
{
    const auto notificationID = DesktopNotification::getNotificationIDFromToast(sender);
    if (notificationID == "")
    {
        DN_LOG_ERROR(L"Could not get notification ID from toast");
        return S_OK;
    }
    const auto userInfo = DesktopNotification::getUserInfoFromToast(sender);

    ToastDismissalReason tdr;
    HRESULT hr = e->get_Reason(&tdr);
    if (SUCCEEDED(hr))
    {
        switch (tdr)
        {
        case ToastDismissalReason_ApplicationHidden:
            invokeJSCallback("hidden", notificationID, userInfo);
            break;
        case ToastDismissalReason_UserCanceled:
            invokeJSCallback("dismissed", notificationID, userInfo);
            break;
        case ToastDismissalReason_TimedOut:
            invokeJSCallback("timedout", notificationID, userInfo);
            break;
        }
    }

    return S_OK;
}

// DesktopToastFailedEventHandler
IFACEMETHODIMP DesktopNotificationsManager::Invoke(_In_ IToastNotification *sender,
                                                   _In_ IToastFailedEventArgs *e)
{
    const auto notificationID = DesktopNotification::getNotificationIDFromToast(sender);
    if (notificationID == "")
    {
        DN_LOG_ERROR(L"Could not get notification ID from toast");
        return S_OK;
    }
    const auto userInfo = DesktopNotification::getUserInfoFromToast(sender);

    DN_LOG_ERROR(L"The toast encountered an error.");
    invokeJSCallback("error", notificationID, userInfo);
    return S_OK;
}

void DesktopNotificationsManager::invokeJSCallback(const std::string &eventName,
                                                   const std::string &notificationID,
                                                   const std::wstring &userInfo)
{
    auto cb = [=](Napi::Env env, Napi::Function jsCallback)
    {
        Napi::Value userInfoObject = env.Undefined();
        if (userInfo != L"")
        {
            Napi::String userInfoString = Napi::String::New(env, (const char16_t *)userInfo.c_str());
            userInfoObject = Utils::JSONParse(env, userInfoString);
        }
        jsCallback.Call({
            Napi::String::New(env, eventName),
            Napi::String::New(env, notificationID),
            userInfoObject,
        });
    };

    m_callback.BlockingCall(cb);
}

std::shared_ptr<DesktopNotificationsManager> desktopNotificationsManager = nullptr;
