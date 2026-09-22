package org

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestMain(m *testing.M) {
	goleak.VerifyTestMain(m)
}

func Test_LogoFolder(t *testing.T) {
	t.Parallel()

	assert.Equal(t, "organizations/org1/logo", LogoFolder("org1"))
}
