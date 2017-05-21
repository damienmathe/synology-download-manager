import { isEqual } from 'lodash-es';
import { ApiClient, SessionName } from 'synology-typescript-api';
import { getHostUrl, onStoredStateChange, NotificationSettings, DEFAULT_SETTINGS } from '../state';
import { setSharedObjects, notify } from '../browserApi';
import { addDownloadTask, pollTasks, clearCachedTasks } from '../apiActions';

const api = new ApiClient({});
const START_TIME = Date.now();

setSharedObjects({ api });

let finishedTaskIds: string[] | undefined;

let notificationSettings: NotificationSettings = DEFAULT_SETTINGS.notifications;
let notificationInterval: number | undefined;

onStoredStateChange(storedState => {
  const didUpdateSettings = api.updateSettings({
    baseUrl: getHostUrl(storedState.connection),
    account: storedState.connection.username,
    passwd: storedState.connection.password,
    session: SessionName.DownloadStation
  });

  browser.browserAction.setBadgeText({
    text: storedState.tasks.length === 0 ? '' : storedState.tasks.length.toString()
  });

  if (didUpdateSettings) {
    clearCachedTasks()
      .then(() => { pollTasks(api); });
  }

  if (!isEqual(storedState.notifications, notificationSettings)) {
    notificationSettings = storedState.notifications;
    clearInterval(notificationInterval!);
    if (notificationSettings.enabled) {
      notificationInterval = setInterval(() => { pollTasks(api); }, notificationSettings.pollingInterval * 1000);
    }
  }
});

onStoredStateChange(storedState => {
  if (storedState.tasksLastCompletedFetchTimestamp != null && storedState.tasksLastCompletedFetchTimestamp > START_TIME && storedState.taskFetchFailureReason == null) {
    const updatedFinishedTaskIds = storedState.tasks
      .filter(t => t.status === 'finished' || t.status === 'seeding')
      .map(t => t.id);
    if (finishedTaskIds != null) {
      const newlyFinishedTaskIds = updatedFinishedTaskIds.filter(id => finishedTaskIds!.indexOf(id) === -1);
      newlyFinishedTaskIds.forEach(id => {
        const task = storedState.tasks.filter(t => t.id === id)[0];
        if (storedState.notifications.enabled) {
          notify(`${task.title}`, 'Download finished');
        }
      });
    }
    finishedTaskIds = (finishedTaskIds || []).concat(updatedFinishedTaskIds.filter(taskId => {
      return !finishedTaskIds || finishedTaskIds.indexOf(taskId) === -1;
    }));
  }
});

browser.contextMenus.create({
  enabled: true,
  title: 'Download with DownloadStation',
  contexts: [ 'link', 'audio', 'video', 'selection' ],
  onclick: (data) => {
    if (data.linkUrl) {
      addDownloadTask(api, data.linkUrl);
    } else if (data.srcUrl) {
      addDownloadTask(api, data.srcUrl);
    } else if (data.selectionText) {
      // The cheapest of checks. Actual invalid URLs will be caught later.
      if (data.selectionText.indexOf('://') !== -1) {
        addDownloadTask(api, data.selectionText);
      } else {
        notify('Failed to add download', 'Selected text is not a valid URL');
      }
    } else {
      notify('Failed to add download', 'URL is empty or missing!');
    }
  }
});