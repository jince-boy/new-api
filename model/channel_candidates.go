package model

import (
	"sort"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

// GetSatisfiedChannels returns every enabled candidate for a group/model pair.
// Unlike GetRandomSatisfiedChannel it does not collapse candidates to one
// priority tier, allowing the service layer to keep static priority as a
// failover boundary while scheduling within the tier.
func GetSatisfiedChannels(group string, modelName string, requestPath string) ([]*Channel, error) {
	if common.MemoryCacheEnabled {
		return getSatisfiedChannelsFromCache(group, modelName, requestPath)
	}
	return getSatisfiedChannelsFromDB(group, modelName, requestPath)
}

func getSatisfiedChannelsFromCache(group string, modelName string, requestPath string) ([]*Channel, error) {
	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	ids := filterChannelsByRequestPathAndModel(group2model2channels[group][modelName], requestPath, modelName)
	if len(ids) == 0 {
		normalizedModel := ratio_setting.FormatMatchingModelName(modelName)
		ids = filterChannelsByRequestPathAndModel(group2model2channels[group][normalizedModel], requestPath, modelName)
	}

	channels := make([]*Channel, 0, len(ids))
	for _, id := range ids {
		channel, ok := channelsIDM[id]
		if !ok {
			continue
		}
		channels = append(channels, channel)
	}
	sortChannelCandidates(channels)
	return channels, nil
}

func getSatisfiedChannelsFromDB(group string, modelName string, requestPath string) ([]*Channel, error) {
	abilities, err := getSatisfiedAbilities(group, modelName)
	if err != nil {
		return nil, err
	}
	if len(abilities) == 0 {
		normalizedModel := ratio_setting.FormatMatchingModelName(modelName)
		if normalizedModel != modelName {
			abilities, err = getSatisfiedAbilities(group, normalizedModel)
			if err != nil {
				return nil, err
			}
		}
	}
	abilities = filterAbilitiesByRequestPathAndModel(abilities, requestPath, modelName)
	if len(abilities) == 0 {
		return nil, nil
	}

	ids := make([]int, 0, len(abilities))
	for _, ability := range abilities {
		ids = append(ids, ability.ChannelId)
	}
	var channels []*Channel
	if err := DB.Where("id IN ? AND status = ?", ids, common.ChannelStatusEnabled).Find(&channels).Error; err != nil {
		return nil, err
	}
	sortChannelCandidates(channels)
	return channels, nil
}

func getSatisfiedAbilities(group string, modelName string) ([]Ability, error) {
	var abilities []Ability
	err := DB.Where(commonGroupCol+" = ? AND model = ? AND enabled = ?", group, modelName, true).
		Find(&abilities).Error
	return abilities, err
}

func sortChannelCandidates(channels []*Channel) {
	sort.SliceStable(channels, func(i, j int) bool {
		if channels[i].GetPriority() == channels[j].GetPriority() {
			return channels[i].Id < channels[j].Id
		}
		return channels[i].GetPriority() > channels[j].GetPriority()
	})
}
